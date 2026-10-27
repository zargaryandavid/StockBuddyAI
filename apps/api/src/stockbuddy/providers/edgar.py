from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import requests
from hedge_fund.data.models import CompanyFacts, FinancialMetrics


class EdgarError(RuntimeError):
    """Raised when EDGAR data cannot be fetched or interpreted safely."""


@dataclass(frozen=True)
class Filing:
    accession: str
    filing_date: str
    report_period: str
    form: str


_DURATION_TAGS = {
    "revenue": (
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
    ),
    "gross_profit": ("GrossProfit",),
    "operating_income": ("OperatingIncomeLoss",),
    "net_income": ("NetIncomeLoss", "ProfitLoss"),
    "cfo": (
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ),
    "capex": (
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsForAdditionsToPropertyPlantAndEquipment",
    ),
    "eps": ("EarningsPerShareDiluted",),
}

_INSTANT_TAGS = {
    "equity": (
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ),
    "debt": (
        "LongTermDebtAndFinanceLeaseObligations",
        "LongTermDebtAndCapitalLeaseObligations",
        "LongTermDebt",
    ),
    "current_assets": ("AssetsCurrent",),
    "current_liabilities": ("LiabilitiesCurrent",),
    "shares": ("EntityCommonStockSharesOutstanding",),
}

_DEBT_CURRENT_TAGS = (
    "LongTermDebtAndFinanceLeaseObligationsCurrent",
    "LongTermDebtCurrent",
    "ShortTermBorrowings",
)
_DEBT_NONCURRENT_TAGS = (
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
    "LongTermDebtNoncurrent",
)


class EdgarClient:
    BASE = "https://data.sec.gov"
    TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
    _request_lock = threading.Lock()
    _last_request = 0.0
    _file_locks: dict[str, threading.Lock] = {}
    _file_locks_guard = threading.Lock()

    def __init__(
        self,
        user_agent: str,
        cache_dir: str | Path = ".cache/sec",
        session: requests.Session | None = None,
        requests_per_second: float = 8.0,
    ) -> None:
        if "@" not in user_agent:
            raise ValueError("SEC User-Agent must include a contact email")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._session = session or requests.Session()
        self._session.headers.update({"User-Agent": user_agent, "Accept-Encoding": "gzip, deflate"})
        self._interval = 1 / min(max(requests_per_second, 0.1), 9.5)
        self._shares_by_key: dict[tuple[str, str, str], float] = {}

    def shares_for(self, ticker: str, report_period: str, filing_date: str | None) -> float | None:
        if filing_date is None:
            return None
        return self._shares_by_key.get((ticker.upper(), report_period, filing_date))

    def get_company_facts(self, ticker: str) -> CompanyFacts | None:
        ticker = ticker.upper()
        cik = self._cik(ticker)
        if cik is None:
            return None
        submissions = self._submissions(cik)
        return CompanyFacts(
            ticker=ticker,
            name=submissions.get("name"),
            cik=str(cik),
            sic_code=str(submissions.get("sic") or "") or None,
            sic_industry=submissions.get("sicDescription"),
            industry=submissions.get("sicDescription"),
            sec_filings_url=f"https://www.sec.gov/edgar/browse/?CIK={cik}",
        )

    def search_companies(self, query: str, limit: int = 8) -> list[dict[str, str]]:
        needle = query.strip().casefold()
        if not needle:
            return []
        payload = self._json(self.TICKERS_URL, "company-tickers.json", max_age=86_400)
        matches: list[tuple[int, str, str]] = []
        for row in payload.values():
            ticker = str(row.get("ticker", "")).strip().upper()
            name = str(row.get("title", "")).strip()
            ticker_key = ticker.casefold()
            name_key = name.casefold()
            if ticker_key == needle:
                rank = 0
            elif name_key == needle:
                rank = 1
            elif name_key.startswith(needle):
                rank = 2
            elif ticker_key.startswith(needle):
                rank = 3
            elif needle in name_key:
                rank = 4
            else:
                continue
            matches.append((rank, ticker, name))
        matches.sort(key=lambda item: (item[0], len(item[2]), item[1]))
        return [
            {"ticker": ticker, "name": name}
            for _, ticker, name in matches[: max(1, min(limit, 20))]
        ]

    def get_financial_metrics(
        self,
        ticker: str,
        end_date: str,
        period: str = "ttm",
        limit: int = 20,
    ) -> list[FinancialMetrics]:
        if period != "ttm":
            raise ValueError("The EDGAR adapter currently supports period='ttm' only")
        ticker = ticker.upper()
        cik = self._cik(ticker)
        if cik is None:
            return []
        submissions = self._submissions(cik)
        filings = [
            item
            for item in self._filings(submissions)
            if item.filing_date <= end_date and item.form in {"10-Q", "10-K"}
        ]
        if not filings:
            return []
        latest_accession = max(filings, key=lambda item: item.filing_date).accession
        facts = self._json(
            f"{self.BASE}/api/xbrl/companyfacts/CIK{cik:010d}.json",
            f"companyfacts-{cik}-{latest_accession}.json",
            max_age=None,
        )
        return self._build_metrics(ticker, filings, facts, limit)

    def _cik(self, ticker: str) -> int | None:
        payload = self._json(self.TICKERS_URL, "company-tickers.json", max_age=86_400)
        for row in payload.values():
            if str(row.get("ticker", "")).upper() == ticker:
                return int(row["cik_str"])
        return None

    def _submissions(self, cik: int) -> dict[str, Any]:
        return self._json(
            f"{self.BASE}/submissions/CIK{cik:010d}.json",
            f"submissions-{cik}.json",
            max_age=21_600,
        )

    @staticmethod
    def _filings(submissions: dict[str, Any]) -> list[Filing]:
        recent = submissions.get("filings", {}).get("recent", {})
        keys = ("accessionNumber", "filingDate", "reportDate", "form")
        columns = [recent.get(key, []) for key in keys]
        if not columns or any(len(column) != len(columns[0]) for column in columns):
            raise EdgarError("SEC submissions payload has inconsistent filing columns")
        return [
            Filing(accession, filed, report, form)
            for accession, filed, report, form in zip(*columns, strict=True)
            if accession and filed and report
        ]

    def _build_metrics(
        self,
        ticker: str,
        filings: list[Filing],
        payload: dict[str, Any],
        limit: int,
    ) -> list[FinancialMetrics]:
        us_gaap = payload.get("facts", {}).get("us-gaap", {})
        if not isinstance(us_gaap, dict):
            raise EdgarError("SEC companyfacts payload has no us-gaap facts")
        dei = payload.get("facts", {}).get("dei", {})

        filings = sorted(filings, key=lambda item: (item.report_period, item.filing_date))
        cumulative: dict[tuple[int, str], dict[str, float | None]] = {}
        discrete_rows: list[dict[str, Any]] = []

        for filing in filings:
            values: dict[str, float | None] = {}
            metadata: dict[str, Any] | None = None
            for field, tags in _DURATION_TAGS.items():
                entry = self._fact_entry(us_gaap, tags, filing, duration=True)
                values[field] = float(entry["val"]) if entry is not None else None
                metadata = metadata or entry
            if metadata is None:
                continue
            fiscal_year = int(metadata.get("fy") or date.fromisoformat(filing.report_period).year)
            fiscal_period = str(metadata.get("fp") or "")
            if fiscal_period not in {"Q1", "Q2", "Q3", "FY"}:
                continue

            current = values
            previous_period = {"Q2": "Q1", "Q3": "Q2", "FY": "Q3"}.get(fiscal_period)
            prior = cumulative.get((fiscal_year, previous_period)) if previous_period else None
            discrete = {
                key: self._difference(value, prior.get(key) if prior else None, fiscal_period)
                for key, value in current.items()
            }
            cumulative[(fiscal_year, fiscal_period)] = current
            instants = {}
            for field, tags in _INSTANT_TAGS.items():
                source = dei if field == "shares" and isinstance(dei, dict) else us_gaap
                entry = self._fact_entry(source, tags, filing, duration=False)
                if entry is None and source is not us_gaap:
                    entry = self._fact_entry(us_gaap, tags, filing, duration=False)
                instants[field] = self._entry_value(entry)
            if instants["debt"] is None:
                current_debt = self._entry_value(
                    self._fact_entry(us_gaap, _DEBT_CURRENT_TAGS, filing, duration=False)
                )
                noncurrent_debt = self._entry_value(
                    self._fact_entry(us_gaap, _DEBT_NONCURRENT_TAGS, filing, duration=False)
                )
                if current_debt is not None or noncurrent_debt is not None:
                    instants["debt"] = (current_debt or 0) + (noncurrent_debt or 0)
            discrete_rows.append(
                {
                    "filing": filing,
                    "currency": metadata.get("_unit", "USD").split("/")[0],
                    "discrete": discrete,
                    "instant": instants,
                }
            )

        results: list[FinancialMetrics] = []
        for index, row in enumerate(discrete_rows):
            window = discrete_rows[max(0, index - 3) : index + 1]
            if len(window) < 4:
                continue
            ttm = {
                field: self._sum_complete([item["discrete"][field] for item in window])
                for field in _DURATION_TAGS
            }
            instant = row["instant"]
            revenue = ttm["revenue"]
            net_income = ttm["net_income"]
            equity = instant["equity"]
            shares = instant["shares"]
            fcf = (
                ttm["cfo"] - abs(ttm["capex"])
                if ttm["cfo"] is not None and ttm["capex"] is not None
                else None
            )
            if shares is not None:
                self._shares_by_key[
                    (ticker, row["filing"].report_period, row["filing"].filing_date)
                ] = shares
            results.append(
                FinancialMetrics(
                    ticker=ticker,
                    report_period=row["filing"].report_period,
                    filing_date=row["filing"].filing_date,
                    period="ttm",
                    currency=row["currency"],
                    gross_margin=self._ratio(ttm["gross_profit"], revenue),
                    operating_margin=self._ratio(ttm["operating_income"], revenue),
                    net_margin=self._ratio(net_income, revenue),
                    return_on_equity=self._ratio(net_income, equity),
                    current_ratio=self._ratio(
                        instant["current_assets"], instant["current_liabilities"]
                    ),
                    debt_to_equity=self._ratio(instant["debt"], equity),
                    earnings_per_share=ttm["eps"],
                    book_value_per_share=self._ratio(equity, shares),
                    free_cash_flow_per_share=self._ratio(fcf, shares),
                )
            )

        results.sort(key=lambda item: (item.filing_date or "", item.report_period), reverse=True)
        for index, metric in enumerate(results):
            prior_index = index + 4
            if prior_index < len(results):
                current_revenue = self._ttm_revenue_for_result(discrete_rows, metric.report_period)
                prior_revenue = self._ttm_revenue_for_result(
                    discrete_rows, results[prior_index].report_period
                )
                metric.revenue_growth = self._growth(current_revenue, prior_revenue)
        return results[:limit]

    @staticmethod
    def _ttm_revenue_for_result(rows: list[dict[str, Any]], report_period: str) -> float | None:
        index = next(
            (i for i, row in enumerate(rows) if row["filing"].report_period == report_period),
            None,
        )
        if index is None or index < 3:
            return None
        return EdgarClient._sum_complete(
            [row["discrete"]["revenue"] for row in rows[index - 3 : index + 1]]
        )

    @staticmethod
    def _fact_entry(
        facts: dict[str, Any],
        tags: tuple[str, ...],
        filing: Filing,
        *,
        duration: bool,
    ) -> dict[str, Any] | None:
        for tag in tags:
            concept = facts.get(tag, {})
            for unit, entries in concept.get("units", {}).items():
                candidates = [
                    {**entry, "_unit": unit}
                    for entry in entries
                    if entry.get("accn") == filing.accession
                    and entry.get("end") == filing.report_period
                    and (("start" in entry) if duration else ("start" not in entry))
                ]
                if candidates:
                    return max(candidates, key=lambda entry: entry.get("filed", ""))
        return None

    @staticmethod
    def _entry_value(entry: dict[str, Any] | None) -> float | None:
        return float(entry["val"]) if entry is not None else None

    @staticmethod
    def _difference(
        value: float | None, previous: float | None, fiscal_period: str
    ) -> float | None:
        if value is None:
            return None
        if fiscal_period == "Q1":
            return value
        return value - previous if previous is not None else None

    @staticmethod
    def _sum_complete(values: list[float | None]) -> float | None:
        return sum(values) if values and all(value is not None for value in values) else None

    @staticmethod
    def _ratio(numerator: float | None, denominator: float | None) -> float | None:
        if numerator is None or denominator in (None, 0):
            return None
        return round(numerator / denominator, 6)

    @staticmethod
    def _growth(current: float | None, previous: float | None) -> float | None:
        if current is None or previous in (None, 0):
            return None
        return round(current / previous - 1, 6)

    def _json(self, url: str, filename: str, max_age: int | None) -> dict[str, Any]:
        path = self.cache_dir / filename.replace("/", "_")
        cached = self._read_cache(path, max_age)
        if cached is not None:
            return cached
        # One download per file: lookups that need the same file wait for it, not each fetch it.
        with self._file_locks_guard:
            file_lock = self._file_locks.setdefault(str(path), threading.Lock())
        with file_lock:
            cached = self._read_cache(path, max_age)
            if cached is not None:
                return cached
            return self._download(url, path)

    @staticmethod
    def _read_cache(path: Path, max_age: int | None) -> dict[str, Any] | None:
        if path.exists() and (max_age is None or time.time() - path.stat().st_mtime < max_age):
            try:
                return json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                path.unlink(missing_ok=True)
        return None

    def _download(self, url: str, path: Path) -> dict[str, Any]:
        # Requests start at most `requests_per_second` apart (SEC fair access), but they
        # no longer wait for each other to finish downloading.
        with self._request_lock:
            now = time.monotonic()
            start = max(now, EdgarClient._last_request + self._interval)
            EdgarClient._last_request = start
        if start > now:
            time.sleep(start - now)
        try:
            response = self._session.get(url, timeout=30)
        except requests.RequestException as exc:
            raise EdgarError(f"SEC request failed: {url}") from exc
        if response.status_code >= 400:
            raise EdgarError(f"SEC request returned HTTP {response.status_code}: {url}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise EdgarError(f"SEC returned invalid JSON: {url}") from exc
        try:
            # Written whole, then swapped in, so another lookup never reads half a file.
            partial = path.with_name(f"{path.name}.{threading.get_ident()}.tmp")
            partial.write_text(json.dumps(payload, separators=(",", ":")))
            os.replace(partial, path)
        except OSError as exc:
            raise EdgarError(f"Could not write SEC cache {path}") from exc
        return payload
