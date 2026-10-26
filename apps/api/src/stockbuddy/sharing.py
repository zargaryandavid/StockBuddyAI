"""Read-only share links for the FIRE plan and a portfolio.

Anyone with a link may view it without signing in, so the link's token is long and
random, the data is read with the service role for that one owner only, and the result
never includes the owner's email or date of birth. Pages are cached briefly so a link
that gets passed around doesn't fan out into price lookups on every view.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from typing import Any
from uuid import UUID

CACHE_SECONDS = 300


def new_token() -> str:
    return secrets.token_urlsafe(32)


class ShareService:
    def __init__(self, repository: Any, market: Any) -> None:
        self.repository = repository
        self.market = market
        self._cache: dict[str, tuple[float, dict[str, Any]]] = {}

    def forget(self, share_token: str) -> None:
        self._cache.pop(share_token, None)

    async def page(self, share_token: str) -> dict[str, Any] | None:
        cached = self._cache.get(share_token)
        if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
            return cached[1]
        link = await self.repository.find_share_link(share_token)
        if link is None:
            return None
        payload = await self._build(link)
        self._cache[share_token] = (time.monotonic(), payload)
        return payload

    async def _build(self, link: dict[str, Any]) -> dict[str, Any]:
        user_id = UUID(link["user_id"])
        owner = await self.repository.shared_owner_name(user_id)
        portfolio = None
        if link.get("portfolio_id"):
            row = await self.repository.get_portfolio(UUID(link["portfolio_id"]), user_id)
            portfolio = await self._priced_portfolio(row) if row else None
        payload: dict[str, Any] = {
            "kind": link["kind"],
            "owner_name": owner,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "portfolio": portfolio,
        }
        if link["kind"] == "fire":
            data = await self.repository.shared_owner_data(user_id)
            currency = (portfolio or {}).get("base_currency") or "USD"
            foreign = {
                item["currency"]
                for item in [*data["entries"], *data["assets"]]
                if item.get("currency") and item["currency"] != currency
            }
            rates = await asyncio.gather(
                *(asyncio.to_thread(self.market.fx_rate, code, currency) for code in foreign)
            )
            payload.update(
                {
                    **data,
                    "currency": currency,
                    "rates": {
                        code: rate for code, rate in zip(foreign, rates, strict=True) if rate
                    },
                }
            )
        return payload

    async def _priced_portfolio(self, row: dict[str, Any]) -> dict[str, Any]:
        currency = row.get("base_currency") or "USD"
        positions = row.get("portfolio_positions") or []

        async def price(position: dict[str, Any]) -> dict[str, Any]:
            try:
                quote = await asyncio.to_thread(
                    self.market.resolve, position["ticker"], base_currency=currency
                )
            except Exception:  # a missing quote leaves the holding unpriced
                quote = {}
            return {
                "ticker": position["ticker"],
                "name": quote.get("name") or position.get("company_name"),
                "shares": position.get("shares"),
                "purchase_price": position.get("purchase_price"),
                "price": quote.get("price"),
                "day_change_percent": quote.get("day_change_percent"),
                "sector": position.get("sector"),
                "asset_type": position.get("asset_type"),
            }

        priced = await asyncio.gather(*(price(position) for position in positions))
        return {
            "name": row.get("name"),
            "cash": row.get("cash"),
            "base_currency": currency,
            "benchmark": row.get("benchmark"),
            "positions": priced,
        }
