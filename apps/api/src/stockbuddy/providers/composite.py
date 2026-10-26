from __future__ import annotations

from datetime import date, timedelta
from typing import Protocol

from hedge_fund.data.models import (
    CompanyFacts,
    CompanyNews,
    Earnings,
    EarningsRecord,
    FinancialMetrics,
    InsiderTrade,
    Price,
    PriceSnapshot,
)

from stockbuddy.providers.edgar import EdgarClient


class PriceProvider(Protocol):
    def get_prices(self, ticker: str, start_date: str, end_date: str, **kwargs) -> list[Price]: ...

    def get_snapshot(self, ticker: str) -> PriceSnapshot | None: ...


class PublicDataClient:
    """EDGAR fundamentals with a separate public market-price source."""

    def __init__(self, edgar: EdgarClient, prices: PriceProvider) -> None:
        self.edgar = edgar
        self.prices = prices

    def get_prices(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        interval: str = "day",
        interval_multiplier: int = 1,
    ) -> list[Price]:
        # The library's cache passes interval and interval_multiplier positionally.
        return self.prices.get_prices(
            ticker,
            start_date,
            end_date,
            interval=interval,
            interval_multiplier=interval_multiplier,
        )

    def get_snapshot(self, ticker: str) -> PriceSnapshot | None:
        return self.prices.get_snapshot(ticker)

    def get_financial_metrics(
        self,
        ticker: str,
        end_date: str,
        period: str = "ttm",
        limit: int = 10,
    ) -> list[FinancialMetrics]:
        rows = self.edgar.get_financial_metrics(ticker, end_date, period, limit)
        for row in rows:
            if not row.filing_date:
                continue
            end = date.fromisoformat(row.filing_date)
            start = (end - timedelta(days=7)).isoformat()
            bars = self.prices.get_prices(ticker, start, row.filing_date)
            eligible = [bar for bar in bars if bar.time[:10] <= row.filing_date]
            if not eligible:
                continue
            price = max(eligible, key=lambda bar: bar.time).close
            shares = self.edgar.shares_for(ticker, row.report_period, row.filing_date)
            row.market_cap = price * shares if shares is not None else None
            row.price_to_earnings_ratio = (
                price / row.earnings_per_share if row.earnings_per_share not in (None, 0) else None
            )
        return rows

    def get_company_facts(self, ticker: str) -> CompanyFacts | None:
        return self.edgar.get_company_facts(ticker)

    def get_news(
        self,
        ticker: str,
        end_date: str,
        start_date: str | None = None,
        limit: int = 1000,
    ) -> list[CompanyNews]:
        return []

    def get_insider_trades(
        self,
        ticker: str,
        end_date: str,
        start_date: str | None = None,
        limit: int = 1000,
    ) -> list[InsiderTrade]:
        return []

    def get_earnings(self, ticker: str) -> Earnings | None:
        return None

    def get_earnings_history(self, ticker: str, limit: int = 12) -> list[EarningsRecord]:
        return []

    def get_market_cap(self, ticker: str, end_date: str) -> float | None:
        rows = self.get_financial_metrics(ticker, end_date, limit=1)
        return rows[0].market_cap if rows else None
