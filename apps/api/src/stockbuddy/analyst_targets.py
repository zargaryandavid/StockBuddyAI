"""Wall Street analysts' 1-year price targets, from Financial Modeling Prep.

This is the same analyst consensus that sites such as TradingView show as a 1-year
forecast. Targets change slowly, so each one is kept for a day in the market_cache table
(shared by every server copy); that keeps a free FMP plan (250 lookups a day) enough.
Funds and companies without analyst coverage have no target and are remembered as such.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

from stockbuddy.market_cache import COMPANY_TTL_SECONDS, MarketCache
from stockbuddy.target_research import MAX_SYMBOLS_PER_REQUEST, ResearchFailed, TargetResearch

logger = logging.getLogger(__name__)

FMP_TARGETS_URL = "https://financialmodelingprep.com/stable/price-target-consensus"
# Hand-entered consensus targets (from public analyst reports) for symbols FMP's plan doesn't
# cover; each says where and when it came from, and is used for up to half a year.
MANUAL_TTL_SECONDS = 183 * 24 * 3_600
# Targets researched on the web by OpenAI, shared by every client.
RESEARCH_TTL_SECONDS = 30 * 24 * 3_600  # refreshed once a month
# While one request researches a symbol, others don't start the same research.
LOCK_SECONDS = 10 * 60
# After a failed research request (no credits, outage), wait before trying again.
RESEARCH_BACKOFF_SECONDS = 10 * 60


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
        self,
        api_key: str,
        cache: MarketCache,
        client: httpx.Client | None = None,
        research: TargetResearch | None = None,
    ) -> None:
        self.api_key = api_key
        self.cache = cache
        self.research = research
        self._client = client or httpx.Client(timeout=10)
        self._research_failed_at = 0.0

    @property
    def configured(self) -> bool:
        return bool(self.api_key) or self.research is not None

    def get_many(self, tickers: list[str]) -> dict[str, dict[str, Any] | None]:
        """Targets, researching any still missing right away (used by tests and scripts)."""
        found, analyzing = self.lookup(tickers)
        if analyzing:
            found.update(
                {k: v for k, v in self.research_now(analyzing).items() if v or k not in found}
            )
        return found

    def lookup(self, tickers: list[str]) -> tuple[dict[str, dict[str, Any] | None], list[str]]:
        """What's known now, instantly, and which symbols still need (re)researching.

        Researched targets are shared by every client: one person's stock, analysed once,
        shows straight away for the next. A month-old one still shows while it is refreshed.
        """
        symbols = sorted({ticker.strip().upper() for ticker in tickers if ticker.strip()})
        if not symbols:
            return {}, []
        stored = self.cache.get_many(
            [f"target:{symbol}" for symbol in symbols], ttl=COMPANY_TTL_SECONDS
        )
        found: dict[str, dict[str, Any] | None] = {
            symbol: stored[f"target:{symbol}"].get("v")
            for symbol in symbols
            if f"target:{symbol}" in stored
        }
        missing = [symbol for symbol in symbols if symbol not in found] if self.api_key else []
        manual = self._manual(symbols)
        if not self.configured and not manual and len(found) < len(symbols):
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
        # FMP's own number wins; a hand-entered approximate one, then web research, fill gaps.
        result = {symbol: found.get(symbol) or manual.get(symbol) for symbol in symbols}
        gaps = [symbol for symbol in symbols if result[symbol] is None]
        analyzing: list[str] = []
        if gaps:
            rows = self.cache.get_rows([f"target_ai:{symbol}" for symbol in gaps])
            for symbol in gaps:
                row = rows.get(f"target_ai:{symbol}")
                if row is not None:
                    result[symbol] = _researched_target(row[0].get("v"))
                if self.research is not None and (row is None or row[1] >= RESEARCH_TTL_SECONDS):
                    analyzing.append(symbol)
        return result, analyzing

    def research_now(self, tickers: list[str]) -> dict[str, dict[str, Any] | None]:
        """Researches up to 10 symbols on the web and saves them for every client.

        A symbol another request is already researching (locked for 10 minutes), or one
        researched within the month, is not asked again.
        """
        symbols = sorted({ticker.strip().upper() for ticker in tickers if ticker.strip()})
        if not symbols or self.research is None:
            return {}
        if time.monotonic() - self._research_failed_at < RESEARCH_BACKOFF_SECONDS:
            raise ResearchFailed("Research is paused after a recent failure")
        rows = self.cache.get_rows(
            [f"target_ai:{s}" for s in symbols] + [f"target_ai_lock:{s}" for s in symbols]
        )
        done = {
            s: _researched_target(rows[f"target_ai:{s}"][0].get("v"))
            for s in symbols
            if f"target_ai:{s}" in rows and rows[f"target_ai:{s}"][1] < RESEARCH_TTL_SECONDS
        }
        ask = [
            s
            for s in symbols
            if s not in done
            and not (
                f"target_ai_lock:{s}" in rows and rows[f"target_ai_lock:{s}"][1] < LOCK_SECONDS
            )
        ][:MAX_SYMBOLS_PER_REQUEST]
        if ask:
            self.cache.put_many({f"target_ai_lock:{s}": {"v": True} for s in ask})
            try:
                answers = self.research.research(ask)
            except ResearchFailed:
                self._research_failed_at = time.monotonic()
                raise
            # "No coverage" (funds, tiny companies) is remembered too, so it isn't re-asked.
            self.cache.put_many({f"target_ai:{s}": {"v": value} for s, value in answers.items()})
            done.update({s: _researched_target(value) for s, value in answers.items()})
        return done

    def _manual(self, symbols: list[str]) -> dict[str, dict[str, Any]]:
        stored = self.cache.get_many(
            [f"target_manual:{symbol}" for symbol in symbols], ttl=MANUAL_TTL_SECONDS
        )
        found: dict[str, dict[str, Any]] = {}
        for symbol in symbols:
            value = (stored.get(f"target_manual:{symbol}") or {}).get("v")
            if isinstance(value, dict) and _number(value.get("target")):
                found[symbol] = {
                    "target": float(value["target"]),
                    "high": None,
                    "low": None,
                    "approximate": True,
                    "source": str(value.get("source") or "public analyst reports"),
                    "as_of": str(value.get("as_of") or ""),
                }
        return found

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


def _researched_target(value: Any) -> dict[str, Any] | None:
    """A stored research answer in the shape the pages show; None for "no coverage"."""
    if not isinstance(value, dict) or not _number(value.get("target")):
        return None
    return {
        "target": float(value["target"]),
        "high": None,
        "low": None,
        "approximate": True,
        "source": f"web research: {value.get('source') or 'public sources'}",
        "as_of": str(value.get("as_of") or ""),
    }
