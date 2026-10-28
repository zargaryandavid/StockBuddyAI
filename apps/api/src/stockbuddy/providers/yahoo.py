from __future__ import annotations

import threading
import time
from datetime import UTC, date, datetime, timedelta
from typing import Any

import requests
from hedge_fund.data.models import Price, PriceSnapshot


class YahooPriceError(RuntimeError):
    pass


class YahooPriceClient:
    """Keyless completed daily prices from Yahoo Finance's public chart response."""

    BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"

    def __init__(self, session: requests.Session | None = None, timeout: float = 30) -> None:
        self._session = session or requests.Session()
        self._session.headers.update({"User-Agent": "Mozilla/5.0 MyPortfolioBuddy/0.1"})
        self._timeout = timeout
        self._names: dict[str, str] = {}
        self._instrument_types: dict[str, str] = {}
        self._currencies: dict[str, str] = {}
        self._exchanges: dict[str, str] = {}
        self._crumb: str | None = None
        self._crumb_lock = threading.Lock()
        self._fund_holdings: dict[str, tuple[float, dict[str, Any] | None]] = {}

    def get_prices(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        interval: str = "day",
        interval_multiplier: int = 1,
    ) -> list[Price]:
        if interval != "day" or interval_multiplier != 1:
            raise ValueError("YahooPriceClient supports daily bars only")
        start = datetime.combine(date.fromisoformat(start_date), datetime.min.time(), tzinfo=UTC)
        end = datetime.combine(
            date.fromisoformat(end_date) + timedelta(days=1),
            datetime.min.time(),
            tzinfo=UTC,
        )
        try:
            response = self._session.get(
                f"{self.BASE_URL}/{ticker.strip().upper()}",
                params={
                    "period1": int(start.timestamp()),
                    "period2": int(end.timestamp()),
                    "interval": "1d",
                    "events": "history",
                },
                timeout=self._timeout,
            )
            response.raise_for_status()
            payload = response.json()
            result = payload["chart"]["result"]
            if not result:
                return []
            metadata = result[0].get("meta") or {}
            name = metadata.get("longName") or metadata.get("shortName")
            if isinstance(name, str) and name.strip():
                self._names[ticker.strip().upper()] = name.strip()
            instrument_type = metadata.get("instrumentType")
            if isinstance(instrument_type, str) and instrument_type.strip():
                self._instrument_types[ticker.strip().upper()] = instrument_type.strip().upper()
            currency = metadata.get("currency")
            if isinstance(currency, str) and currency.strip():
                self._currencies[ticker.strip().upper()] = currency.strip().upper()
            exchange = metadata.get("exchangeName") or metadata.get("fullExchangeName")
            if isinstance(exchange, str) and exchange.strip():
                self._exchanges[ticker.strip().upper()] = exchange.strip()
            timestamps = result[0].get("timestamp") or []
            quotes = result[0]["indicators"]["quote"][0]
        except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
            raise YahooPriceError(f"Public price request failed for {ticker}") from exc

        prices: list[Price] = []
        for index, timestamp in enumerate(timestamps):
            try:
                values = {
                    field: quotes[field][index]
                    for field in ("open", "high", "low", "close", "volume")
                }
                if any(value is None for value in values.values()):
                    continue
                prices.append(
                    Price(
                        open=float(values["open"]),
                        high=float(values["high"]),
                        low=float(values["low"]),
                        close=float(values["close"]),
                        volume=int(values["volume"]),
                        time=datetime.fromtimestamp(timestamp, UTC).date().isoformat(),
                    )
                )
            except (IndexError, KeyError, TypeError, ValueError) as exc:
                raise YahooPriceError(f"Public price response was invalid for {ticker}") from exc
        return prices

    SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
    _SEARCH_TYPES = ("EQUITY", "ETF", "MUTUALFUND", "INDEX")

    def search_symbol(self, query: str) -> dict[str, str] | None:
        """Best listed symbol for a company or fund name, e.g. 'Google' -> GOOG."""
        try:
            response = self._session.get(
                self.SEARCH_URL,
                params={"q": query.strip(), "quotesCount": 6, "newsCount": 0},
                timeout=self._timeout,
            )
            response.raise_for_status()
            quotes = response.json().get("quotes") or []
        except (requests.RequestException, ValueError, AttributeError) as exc:
            raise YahooPriceError(f"Public symbol search failed for {query}") from exc
        for quote in quotes:
            symbol = quote.get("symbol")
            if (
                isinstance(symbol, str)
                and quote.get("quoteType") in self._SEARCH_TYPES
                and "." not in symbol
            ):
                name = quote.get("longname") or quote.get("shortname") or symbol
                return {"ticker": symbol.upper(), "name": str(name)}
        return None

    COOKIE_URL = "https://fc.yahoo.com"
    CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"
    QUOTE_SUMMARY_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary"
    FUND_HOLDINGS_TTL = 12 * 60 * 60
    # Yahoo's fund sector keys, named the way the web app names GICS sectors.
    _FUND_SECTORS = {
        "technology": "Information Technology",
        "healthcare": "Health Care",
        "financial_services": "Financials",
        "consumer_cyclical": "Consumer Discretionary",
        "consumer_defensive": "Consumer Staples",
        "communication_services": "Communication Services",
        "industrials": "Industrials",
        "energy": "Energy",
        "utilities": "Utilities",
        "realestate": "Real Estate",
        "basic_materials": "Materials",
    }

    def fund_holdings(self, ticker: str) -> dict[str, Any] | None:
        """A fund's top holdings (Yahoo lists the top 10) and complete sector weights.

        Returns None for stocks, unknown symbols and failed requests. Answers, including
        empty ones, are kept in memory for 12 hours per ticker.
        """
        symbol = ticker.strip().upper()
        cached = self._fund_holdings.get(symbol)
        if cached and time.monotonic() - cached[0] < self.FUND_HOLDINGS_TTL:
            return cached[1]
        try:
            data = self._parse_fund_holdings(self._quote_summary(symbol, "topHoldings"))
        except YahooPriceError:
            # A failure is not remembered, so the next request tries again.
            return None
        self._fund_holdings[symbol] = (time.monotonic(), data)
        return data

    def _crumb_value(self, refresh: bool = False) -> str:
        with self._crumb_lock:
            if self._crumb and not refresh:
                return self._crumb
            try:
                # Sets the session cookie the crumb belongs to; a 404 here is normal.
                self._session.get(self.COOKIE_URL, timeout=self._timeout)
                response = self._session.get(self.CRUMB_URL, timeout=self._timeout)
                response.raise_for_status()
                crumb = response.text.strip()
            except (requests.RequestException, AttributeError) as exc:
                raise YahooPriceError("Public fund data sign-in failed") from exc
            if not crumb or "<" in crumb or " " in crumb:
                raise YahooPriceError("Public fund data sign-in failed")
            self._crumb = crumb
            return crumb

    def _quote_summary(self, symbol: str, modules: str) -> dict[str, Any] | None:
        try:
            for attempt in range(2):
                response = self._session.get(
                    f"{self.QUOTE_SUMMARY_URL}/{symbol}",
                    params={"modules": modules, "crumb": self._crumb_value(refresh=attempt > 0)},
                    timeout=self._timeout,
                )
                if response.status_code in (401, 403) and attempt == 0:
                    continue
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                result = (response.json().get("quoteSummary") or {}).get("result") or []
                return result[0] if result else None
        except (requests.RequestException, ValueError, AttributeError, TypeError) as exc:
            raise YahooPriceError(f"Public fund data request failed for {symbol}") from exc
        return None

    @classmethod
    def _parse_fund_holdings(cls, summary: dict[str, Any] | None) -> dict[str, Any] | None:
        top = (summary or {}).get("topHoldings")
        if not isinstance(top, dict):
            return None
        holdings: list[dict[str, Any]] = []
        for item in top.get("holdings") or []:
            if not isinstance(item, dict):
                continue
            symbol = item.get("symbol")
            weight = _raw_number(item.get("holdingPercent"))
            if not isinstance(symbol, str) or not symbol.strip() or not weight or weight <= 0:
                continue
            name = item.get("holdingName")
            holdings.append(
                {
                    "ticker": symbol.strip().upper(),
                    "name": name.strip() if isinstance(name, str) and name.strip() else symbol,
                    "weight": weight,
                }
            )
        sectors: dict[str, float] = {}
        for entry in top.get("sectorWeightings") or []:
            if not isinstance(entry, dict):
                continue
            for key, value in entry.items():
                weight = _raw_number(value)
                if not weight or weight <= 0:
                    continue
                sector = cls._FUND_SECTORS.get(str(key).lower(), "Unknown")
                sectors[sector] = sectors.get(sector, 0.0) + weight
        if not holdings and not sectors:
            return None
        return {"holdings": holdings, "sectors": sectors}

    def name_for(self, ticker: str) -> str | None:
        return self._names.get(ticker.strip().upper())

    def instrument_type_for(self, ticker: str) -> str | None:
        return self._instrument_types.get(ticker.strip().upper())

    def currency_for(self, ticker: str) -> str | None:
        return self._currencies.get(ticker.strip().upper())

    def exchange_for(self, ticker: str) -> str | None:
        return self._exchanges.get(ticker.strip().upper())

    def get_snapshot(self, ticker: str) -> PriceSnapshot | None:
        today = date.today()
        prices = self.get_prices(
            ticker,
            (today - timedelta(days=14)).isoformat(),
            today.isoformat(),
        )
        if not prices:
            return None
        latest = prices[-1]
        return PriceSnapshot(ticker=ticker.upper(), price=latest.close, time=latest.time)


def _raw_number(value: Any) -> float | None:
    """Yahoo wraps numbers as {"raw": 0.08, "fmt": "8.00%"}; plain numbers pass through."""
    if isinstance(value, dict):
        value = value.get("raw")
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)
