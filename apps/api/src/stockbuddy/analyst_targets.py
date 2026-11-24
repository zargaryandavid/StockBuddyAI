"""Wall Street analysts' 1-year price targets, from Financial Modeling Prep.

This is the same analyst consensus that sites such as TradingView show as a 1-year
forecast. Targets change slowly, so each one is kept for a day in the market_cache table
(shared by every server copy); that keeps a free FMP plan (250 lookups a day) enough.
Funds and companies without analyst coverage have no target and are remembered as such.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

from stockbuddy.market_cache import COMPANY_TTL_SECONDS, MarketCache

logger = logging.getLogger(__name__)

FMP_TARGETS_URL = "https://financialmodelingprep.com/stable/price-target-consensus"


class TargetsUnavailable(RuntimeError):
    """The FMP key is missing or was rejected."""


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def parse_consensus(payload: Any) -> dict[str, float] | None:
    """FMP's answer as {target, high, low}; None when analysts don't cover the symbol."""
    row = payload[0] if isinstance(payload, list) and payload else payload
    if not isinstance(row, dict):
        return None
    target = _number(row.get("targetConsensus")) or _number(row.get("targetMedian"))
    if target is None:
        return None
    return {
        "target": round(target, 4),
        "high": _number(row.get("targetHigh")),
        "low": _number(row.get("targetLow")),
    }


class AnalystTargets:
    def __init__(
        self, api_key: str, cache: MarketCache, client: httpx.Client | None = None
    ) -> None:
        self.api_key = api_key
        self.cache = cache
        self._client = client or httpx.Client(timeout=10)

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def get_many(self, tickers: list[str]) -> dict[str, dict[str, float] | None]:
        symbols = sorted({ticker.strip().upper() for ticker in tickers if ticker.strip()})
        if not symbols:
            return {}
        stored = self.cache.get_many(
            [f"target:{symbol}" for symbol in symbols], ttl=COMPANY_TTL_SECONDS
        )
        found: dict[str, dict[str, float] | None] = {
            symbol: stored[f"target:{symbol}"].get("v")
            for symbol in symbols
            if f"target:{symbol}" in stored
        }
        missing = [symbol for symbol in symbols if symbol not in found]
        if missing and not self.configured:
            raise TargetsUnavailable("Add a Financial Modeling Prep key in Admin → Connections.")
        if missing:
            with ThreadPoolExecutor(max_workers=6) as pool:
                fetched = dict(zip(missing, pool.map(self._fetch, missing), strict=True))
            # Only real answers are remembered; a failed lookup is tried again next time.
            fresh = {symbol: value for symbol, value in fetched.items() if value != "error"}
            self.cache.put_many(
                {f"target:{symbol}": {"v": value} for symbol, value in fresh.items()}
            )
            found.update(
                {symbol: (None if value == "error" else value) for symbol, value in fetched.items()}
            )
        return {symbol: found.get(symbol) for symbol in symbols}

    def _fetch(self, symbol: str) -> dict[str, float] | None | str:
        try:
            response = self._client.get(
                FMP_TARGETS_URL, params={"symbol": symbol, "apikey": self.api_key}
            )
        except httpx.HTTPError as exc:
            logger.warning(
                "Analyst target lookup failed for %s: %s", symbol, exc.__class__.__name__
            )
            return "error"
        if response.status_code in (401, 403):
            # A rejected key, or a symbol the free plan doesn't include: no target to show.
            return (
                None
                if "plan" in response.text.lower() or "premium" in response.text.lower()
                else "error"
            )
        if response.status_code == 429 or response.status_code >= 500:
            logger.warning("Analyst target lookup for %s returned %s", symbol, response.status_code)
            return "error"
        if response.status_code >= 400:
            return None
        try:
            return parse_consensus(response.json())
        except ValueError:
            return "error"
