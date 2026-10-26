from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any, Protocol

from hedge_fund.data.models import CompanyFacts, Price

from stockbuddy.classification import classify_security, lifecycle_phase


class CompanyDirectory(Protocol):
    def search_companies(self, query: str, limit: int = 8) -> list[dict[str, str]]: ...

    def get_company_facts(self, ticker: str) -> CompanyFacts | None: ...


class PriceHistory(Protocol):
    def get_prices(self, ticker: str, start_date: str, end_date: str, **kwargs) -> list[Price]: ...


class SecurityNotFoundError(ValueError):
    pass


class SecurityOverviewService:
    """Resolve a company name or symbol and attach public end-of-day market data."""

    def __init__(self, companies: CompanyDirectory, prices: PriceHistory) -> None:
        self.companies = companies
        self.prices = prices

    def resolve(
        self,
        query: str,
        as_of: date | None = None,
        base_currency: str = "USD",
    ) -> dict[str, Any]:
        matches = self.companies.search_companies(query, limit=1)
        if not matches:
            matches = self._search_listed_symbol(query)
        ticker_query = query.strip().upper()
        if not matches and not re.fullmatch(r"[A-Z][A-Z0-9.-]{0,11}", ticker_query):
            raise SecurityNotFoundError(f"No company or ticker matched '{query.strip()}'")

        match = matches[0] if matches else {"ticker": ticker_query, "name": ticker_query}
        ticker = match["ticker"]
        end = as_of or date.today()
        try:
            bars = self.prices.get_prices(
                ticker,
                (end - timedelta(days=370)).isoformat(),
                end.isoformat(),
            )
        except RuntimeError:
            if matches:
                raise
            raise SecurityNotFoundError(f"No company or ticker matched '{query.strip()}'") from None
        eligible = sorted(
            (bar for bar in bars if bar.time[:10] <= end.isoformat()), key=lambda bar: bar.time
        )
        if not matches and not eligible:
            raise SecurityNotFoundError(f"No public security matched '{query.strip()}'")
        latest_price = eligible[-1].close if eligible else None

        def growth_for(days: int) -> float | None:
            if len(eligible) < 2:
                return None
            target = end - timedelta(days=days)
            history = eligible[:-1]
            baseline = min(
                history,
                key=lambda bar: abs((date.fromisoformat(bar.time[:10]) - target).days),
            )
            if not baseline.close:
                return None
            return (eligible[-1].close / baseline.close - 1) * 100

        growth_1m = growth_for(30)
        growth_6m = growth_for(182)
        growth_1y = growth_for(365)

        facts = self.companies.get_company_facts(ticker)
        provider_name = getattr(self.prices, "name_for", lambda _ticker: None)(ticker)
        instrument_type = getattr(self.prices, "instrument_type_for", lambda _ticker: None)(ticker)
        provider_currency = getattr(self.prices, "currency_for", lambda _ticker: None)(ticker)
        quote_currency = (provider_currency or base_currency).upper()
        fx_rate = self._fx_rate(quote_currency, base_currency.upper(), end)
        converted_price = (
            latest_price * fx_rate if latest_price is not None and fx_rate is not None else None
        )
        previous_price = eligible[-2].close if len(eligible) >= 2 else None
        day_change = (
            (latest_price - previous_price) * fx_rate
            if latest_price is not None and previous_price is not None and fx_rate is not None
            else None
        )
        day_change_percent = (
            (latest_price / previous_price - 1) * 100
            if latest_price is not None and previous_price
            else None
        )
        security_name = (
            (facts.name if facts and facts.name else None) or provider_name or match["name"]
        )
        industry = (facts.industry or facts.sic_industry) if facts else None
        classification = classify_security(instrument_type, security_name, industry)
        metrics: list[Any] = []
        metrics_loader = getattr(self.companies, "get_financial_metrics", None)
        if facts and metrics_loader:
            try:
                metrics = metrics_loader(ticker, end.isoformat(), limit=4)
            except (RuntimeError, ValueError):
                metrics = []
        phase, phase_evidence = lifecycle_phase(str(classification["asset_type"]), metrics)
        latest_report = metrics[0] if metrics else None
        eps = getattr(latest_report, "earnings_per_share", None) if latest_report else None
        pe_ratio = (
            latest_price / eps if latest_price is not None and eps is not None and eps > 0 else None
        )
        return {
            "ticker": ticker,
            "name": security_name,
            "price": converted_price,
            "raw_price": latest_price,
            "growth": growth_1y,
            "growth_1m": growth_1m,
            "growth_6m": growth_6m,
            "growth_1y": growth_1y,
            **classification,
            "price_date": eligible[-1].time[:10] if eligible else None,
            "price_timestamp": eligible[-1].time if eligible else None,
            "price_source": "Yahoo Finance" if eligible else None,
            "previous_close": (
                previous_price * fx_rate
                if previous_price is not None and fx_rate is not None
                else None
            ),
            "day_change": day_change,
            "day_change_percent": day_change_percent,
            "quote_currency": quote_currency,
            "base_currency": base_currency.upper(),
            "fx_rate": fx_rate,
            "lifecycle_phase": phase,
            "lifecycle_evidence": phase_evidence,
            "lifecycle_updated_at": (
                eligible[-1].time if eligible and phase != "Not Analyzed" else None
            ),
            "pe_ratio": pe_ratio,
            "report_date": latest_report.filing_date if latest_report else None,
            "report_source": "SEC EDGAR" if latest_report and latest_report.filing_date else None,
            "is_etf_index": classification["asset_type"]
            in {"ETF", "Mutual Fund", "Closed-End Fund", "Trust", "Index"},
        }

    def _search_listed_symbol(self, query: str) -> list[dict[str, str]]:
        search = getattr(self.prices, "search_symbol", None)
        if search is None:
            return []
        try:
            found = search(query)
        except RuntimeError:
            return []
        if not found:
            return []
        return self.companies.search_companies(found["ticker"], limit=1) or [found]

    def close_history(
        self, tickers: list[str], start: date, end: date | None = None
    ) -> dict[str, list[dict[str, Any]]]:
        """Completed daily closes per ticker; a ticker whose request fails gets an empty list."""
        finish = end or date.today()
        history: dict[str, list[dict[str, Any]]] = {}
        for ticker in tickers:
            try:
                bars = self.prices.get_prices(ticker, start.isoformat(), finish.isoformat())
            except RuntimeError:
                bars = []
            history[ticker] = [
                {"date": bar.time[:10], "close": bar.close}
                for bar in sorted(bars, key=lambda bar: bar.time)
                if bar.time[:10] <= finish.isoformat()
            ]
        return history

    def fx_rate(self, source: str, target: str, as_of: date | None = None) -> float | None:
        """Latest completed close converting one unit of `source` into `target`."""
        return self._fx_rate(source.upper(), target.upper(), as_of or date.today())

    def _fx_rate(self, source: str, target: str, end: date) -> float | None:
        if source == target:
            return 1.0
        start = (end - timedelta(days=14)).isoformat()
        end_date = end.isoformat()
        try:
            direct = self.prices.get_prices(f"{source}{target}=X", start, end_date)
        except RuntimeError:
            direct = []
        if direct:
            return direct[-1].close
        try:
            inverse = self.prices.get_prices(f"{target}{source}=X", start, end_date)
        except RuntimeError:
            inverse = []
        if inverse and inverse[-1].close:
            return 1 / inverse[-1].close
        return None
