from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import requests
from hedge_fund.data.models import Price, PriceSnapshot


class YahooPriceError(RuntimeError):
    pass


class YahooPriceClient:
    """Keyless completed daily prices from Yahoo Finance's public chart response."""

    BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"

    def __init__(self, session: requests.Session | None = None, timeout: float = 30) -> None:
        self._session = session or requests.Session()
        self._session.headers.update({"User-Agent": "Mozilla/5.0 StockBuddyAI/0.1"})
        self._timeout = timeout
        self._names: dict[str, str] = {}
        self._instrument_types: dict[str, str] = {}
        self._currencies: dict[str, str] = {}
        self._exchanges: dict[str, str] = {}

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
