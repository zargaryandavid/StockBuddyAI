"""Company data from the SEC kept in the database, so every server copy can use it.

Looking up a stock needs its SEC company record, filings and financial figures. Downloading
them takes about a second per stock, and each new server copy (Vercel starts them often)
began with nothing, so a page of 15 holdings waited about 4 seconds. These records change
once a quarter, so they are kept for a day in the market_cache table and read back in one
request; only the price itself is fetched live.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import UTC, datetime
from typing import Any

import httpx
from hedge_fund.data.models import CompanyFacts, FinancialMetrics

from stockbuddy.config import Settings

logger = logging.getLogger(__name__)

# SEC records are refreshed once a day; filings come out once a quarter.
COMPANY_TTL_SECONDS = 24 * 3_600


class MarketCache:
    """Reads and writes the market_cache table with the service role key."""

    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        self.enabled = bool(settings.supabase_service_role_key)
        self._url = f"{settings.supabase_url.rstrip('/')}/rest/v1/market_cache"
        key = settings.supabase_service_role_key
        self._headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        self._client = client or httpx.Client(timeout=5)

    def get_many(self, keys: list[str], ttl: float = COMPANY_TTL_SECONDS) -> dict[str, Any]:
        """The fresh entries among keys, as {key: value}; nothing when the table can't be read."""
        if not self.enabled or not keys:
            return {}
        quoted = ",".join('"' + key.replace("\\", "\\\\").replace('"', '\\"') + '"' for key in keys)
        try:
            response = self._client.get(
                self._url,
                headers=self._headers,
                params={"select": "key,value,fetched_at", "key": f"in.({quoted})"},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Market cache read failed: %s", exc)
            return {}
        now = datetime.now(UTC)
        fresh: dict[str, Any] = {}
        for row in response.json():
            fetched = datetime.fromisoformat(str(row["fetched_at"]).replace("Z", "+00:00"))
            if (now - fetched).total_seconds() < ttl:
                fresh[row["key"]] = row["value"]
        return fresh

    def put_many(self, entries: dict[str, Any]) -> None:
        if not self.enabled or not entries:
            return
        now = datetime.now(UTC).isoformat()
        rows = [{"key": key, "value": value, "fetched_at": now} for key, value in entries.items()]
        try:
            response = self._client.post(
                self._url,
                headers={**self._headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
                json=rows,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Market cache write failed: %s", exc)


class CachedCompanies:
    """The SEC company directory, answered from memory, then the database, then the SEC."""

    def __init__(self, inner: Any, cache: MarketCache) -> None:
        self.inner = inner
        self.cache = cache
        self._memory: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def __getattr__(self, name: str) -> Any:
        # Anything not cached here (fund holdings, filings lists…) goes straight to the SEC.
        return getattr(self.inner, name)

    @staticmethod
    def keys_for(queries: list[str]) -> list[str]:
        """What a lookup of these holdings will read, so they can be loaded in one request."""
        keys: list[str] = []
        for query in queries:
            symbol = query.strip().upper()
            keys += [_search_key(query, 1), f"facts:{symbol}", f"metrics:{symbol}"]
        return keys

    def preload(self, queries: list[str]) -> None:
        missing = [key for key in self.keys_for(queries) if not self._fresh(key)]
        found = self.cache.get_many(missing)
        with self._lock:
            for key, value in found.items():
                self._memory[key] = (time.monotonic(), value)

    def search_companies(self, query: str, limit: int = 8) -> list[dict[str, str]]:
        return self._cached(
            _search_key(query, limit),
            lambda: self.inner.search_companies(query, limit=limit),
            dump=lambda found: found,
            load=lambda stored: stored,
        )

    def get_company_facts(self, ticker: str) -> CompanyFacts | None:
        return self._cached(
            f"facts:{ticker.strip().upper()}",
            lambda: self.inner.get_company_facts(ticker),
            dump=lambda facts: facts.model_dump(mode="json") if facts else None,
            load=lambda stored: CompanyFacts.model_validate(stored) if stored else None,
        )

    def get_financial_metrics(
        self, ticker: str, end_date: str, period: str = "ttm", limit: int = 20
    ) -> list[FinancialMetrics]:
        # Kept by ticker: within a day the latest figures are the same for any end date.
        return self._cached(
            f"metrics:{ticker.strip().upper()}",
            lambda: self.inner.get_financial_metrics(ticker, end_date, period=period, limit=limit),
            dump=lambda rows: [row.model_dump(mode="json") for row in rows],
            load=lambda stored: [FinancialMetrics.model_validate(row) for row in stored],
        )

    def _fresh(self, key: str) -> bool:
        entry = self._memory.get(key)
        return entry is not None and time.monotonic() - entry[0] < COMPANY_TTL_SECONDS

    def _cached(self, key: str, fetch, dump, load):
        if not self._fresh(key):
            stored = self.cache.get_many([key])
            if key in stored:
                with self._lock:
                    self._memory[key] = (time.monotonic(), stored[key])
        if self._fresh(key):
            return load(self._memory[key][1]["v"])
        value = fetch()
        entry = {"v": dump(value)}
        with self._lock:
            self._memory[key] = (time.monotonic(), entry)
        self.cache.put_many({key: entry})
        return value


def _search_key(query: str, limit: int) -> str:
    return f"search:{limit}:{' '.join(query.split()).casefold()}"
