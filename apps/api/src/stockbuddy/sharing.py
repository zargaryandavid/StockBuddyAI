"""Read-only share links for the Today page, the FIRE plan and a portfolio.

Anyone with a link may view it without signing in, so the link's token is long and
random, the data is read with the service role for that one owner only, and the result
never includes the owner's email or date of birth. Pages are cached briefly so a link
that gets passed around doesn't fan out into price lookups on every view.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from datetime import date, timedelta
from typing import Any
from uuid import UUID

CACHE_SECONDS = 300
# A Today link shows the net worth chart's last two years.
TODAY_HISTORY_DAYS = 730


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
            payload.update({**data, **await self._rates(data, [], currency)})
        elif link["kind"] == "today":
            since = (date.today() - timedelta(days=TODAY_HISTORY_DAYS)).isoformat()
            rows, data, history = await asyncio.gather(
                self.repository.shared_owner_portfolios(user_id),
                self.repository.shared_owner_data(user_id),
                self.repository.shared_net_worth(user_id, since),
            )
            portfolios = await asyncio.gather(*(self._priced_portfolio(row) for row in rows))
            currency = portfolios[0]["base_currency"] if portfolios else "USD"
            payload.update(
                {
                    **data,
                    **await self._rates(data, portfolios, currency),
                    "portfolios": portfolios,
                    "history": history,
                }
            )
        return payload

    async def _rates(
        self, data: dict[str, Any], portfolios: list[dict[str, Any]], currency: str
    ) -> dict[str, Any]:
        """Exchange rates into `currency` for everything kept in another currency."""
        foreign = {
            item["currency"]
            for item in [
                *data["entries"],
                *data["assets"],
                *(cash for portfolio in portfolios for cash in portfolio.get("other_cash") or []),
            ]
            if item.get("currency") and item["currency"] != currency
        }
        codes = sorted(foreign)
        rates = await asyncio.gather(
            *(asyncio.to_thread(self.market.fx_rate, code, currency) for code in codes)
        )
        return {
            "currency": currency,
            "rates": {code: rate for code, rate in zip(codes, rates, strict=True) if rate},
        }

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
                "day_change": quote.get("day_change"),
                "day_change_percent": quote.get("day_change_percent"),
                "price_date": quote.get("price_date"),
                "sector": quote.get("sector") or position.get("sector"),
                "asset_type": quote.get("asset_type") or position.get("asset_type"),
                "is_etf_index": bool(quote.get("is_etf_index")),
            }

        priced = await asyncio.gather(*(price(position) for position in positions))
        return {
            "name": row.get("name"),
            "cash": row.get("cash"),
            "other_cash": row.get("other_cash") or [],
            "base_currency": currency,
            "benchmark": row.get("benchmark"),
            "positions": priced,
        }
