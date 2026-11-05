from datetime import date
from types import SimpleNamespace

import pytest
from hedge_fund.data.models import CompanyFacts, Price

from stockbuddy.market import SecurityNotFoundError, SecurityOverviewService


class Companies:
    def search_companies(self, query, limit=8):
        if query.casefold() not in {"aapl", "apple"}:
            return []
        return [{"ticker": "AAPL", "name": "Apple Inc."}][:limit]

    def get_company_facts(self, ticker):
        if ticker != "AAPL":
            return None
        return CompanyFacts(
            ticker=ticker,
            name="Apple Inc.",
            cik="320193",
            sic_industry="Electronic Computers",
            industry="Technology",
        )

    def get_financial_metrics(self, ticker, end_date, limit=4):
        return [SimpleNamespace(filing_date="2026-08-01", earnings_per_share=6.0)]


class Prices:
    def get_prices(self, ticker, start_date, end_date, **kwargs):
        assert ticker == "AAPL"
        assert start_date == "2025-10-18"
        assert end_date == "2026-10-23"
        return [
            Price(open=100, high=101, low=99, close=100, volume=10, time="2025-10-20"),
            Price(open=119, high=121, low=118, close=120, volume=12, time="2026-10-22"),
        ]

    def name_for(self, ticker):
        return "Apple Inc." if ticker == "AAPL" else None

    def instrument_type_for(self, ticker):
        return "EQUITY"


def test_resolve_normalizes_name_and_calculates_growth():
    overview = SecurityOverviewService(Companies(), Prices()).resolve(
        "Apple", as_of=date(2026, 10, 23)
    )

    assert overview["ticker"] == "AAPL"
    assert overview["name"] == "Apple Inc."
    assert overview["price"] == 120
    assert overview["growth"] == pytest.approx(20)
    assert overview["growth_1m"] == pytest.approx(20)
    assert overview["growth_6m"] == pytest.approx(20)
    assert overview["growth_1y"] == pytest.approx(20)
    assert overview["sector"] == "Information Technology"
    assert overview["asset_type"] == "Common Stock"
    assert overview["price_date"] == "2026-10-22"
    assert overview["report_date"] == "2026-08-01"
    assert overview["report_source"] == "SEC EDGAR"
    assert overview["day_change"] == 20
    assert overview["is_etf_index"] is False
    assert overview["pe_ratio"] == pytest.approx(20)


def test_resolve_rejects_unknown_company():
    with pytest.raises(SecurityNotFoundError, match="No company or ticker matched"):
        SecurityOverviewService(Companies(), Prices()).resolve("not real")


def test_resolve_calculates_one_month_six_month_and_one_year_growth():
    class MultiPeriodPrices(Prices):
        def get_prices(self, ticker, start_date, end_date, **kwargs):
            return [
                Price(open=50, high=51, low=49, close=50, volume=10, time="2025-10-23"),
                Price(open=80, high=81, low=79, close=80, volume=10, time="2026-04-24"),
                Price(open=110, high=111, low=109, close=110, volume=10, time="2026-09-23"),
                Price(open=120, high=121, low=119, close=120, volume=10, time="2026-10-22"),
            ]

    overview = SecurityOverviewService(Companies(), MultiPeriodPrices()).resolve(
        "AAPL", as_of=date(2026, 10, 23)
    )

    assert overview["growth_1m"] == pytest.approx((120 / 110 - 1) * 100)
    assert overview["growth_6m"] == pytest.approx(50)
    assert overview["growth_1y"] == pytest.approx(140)
    assert overview["growth"] == overview["growth_1y"]


def test_resolve_accepts_a_public_etf_ticker_missing_from_sec_directory():
    class EtfPrices(Prices):
        def get_prices(self, ticker, start_date, end_date, **kwargs):
            return [
                Price(open=500, high=501, low=499, close=500, volume=10, time="2025-10-20"),
                Price(open=600, high=601, low=599, close=600, volume=12, time="2026-10-22"),
            ]

        def name_for(self, ticker):
            return "Vanguard S&P 500 ETF"

        def instrument_type_for(self, ticker):
            return "ETF"

    overview = SecurityOverviewService(Companies(), EtfPrices()).resolve(
        "VOO", as_of=date(2026, 10, 23)
    )

    assert overview["ticker"] == "VOO"
    assert overview["name"] == "Vanguard S&P 500 ETF"
    assert overview["price"] == 600
    assert overview["report_date"] is None
    assert overview["is_etf_index"] is True


def test_resolve_finds_a_brand_name_through_public_symbol_search():
    class SearchPrices(Prices):
        def search_symbol(self, query):
            assert query == "Google"
            return {"ticker": "AAPL", "name": "Apple Inc."}

    overview = SecurityOverviewService(Companies(), SearchPrices()).resolve(
        "Google", as_of=date(2026, 10, 23)
    )

    assert overview["ticker"] == "AAPL"
    assert overview["name"] == "Apple Inc."


def test_unknown_name_that_looks_like_a_ticker_is_not_found_not_a_price_error():
    class MissingPrices(Prices):
        def search_symbol(self, query):
            return None

        def get_prices(self, ticker, start_date, end_date, **kwargs):
            raise RuntimeError(f"Public price request failed for {ticker}")

    with pytest.raises(SecurityNotFoundError, match="No company or ticker matched 'Googlx'"):
        SecurityOverviewService(Companies(), MissingPrices()).resolve(
            "Googlx", as_of=date(2026, 10, 23)
        )


def test_pe_ratio_is_unavailable_without_positive_earnings():
    class LossMaking(Companies):
        def get_financial_metrics(self, ticker, end_date, limit=4):
            return [SimpleNamespace(filing_date="2026-08-01", earnings_per_share=-1.5)]

    overview = SecurityOverviewService(LossMaking(), Prices()).resolve(
        "Apple", as_of=date(2026, 10, 23)
    )

    assert overview["pe_ratio"] is None


def test_close_history_returns_sorted_closes_and_tolerates_failures():
    class HistoryPrices(Prices):
        def get_prices(self, ticker, start_date, end_date, **kwargs):
            if ticker == "BAD":
                raise RuntimeError("Public price request failed for BAD")
            return [
                Price(open=1, high=1, low=1, close=12, volume=1, time="2026-10-22"),
                Price(open=1, high=1, low=1, close=10, volume=1, time="2026-10-20"),
            ]

    history = SecurityOverviewService(Companies(), HistoryPrices()).close_history(
        ["SPY", "BAD"], date(2026, 10, 1), date(2026, 10, 23)
    )

    assert history["SPY"] == [
        {"date": "2026-10-20", "close": 10},
        {"date": "2026-10-22", "close": 12},
    ]
    assert history["BAD"] == []


def test_an_exact_fund_symbol_wins_over_a_company_name_starting_the_same():
    class VoCompanies(Companies):
        def search_companies(self, query, limit=8):
            # "VO" is not an SEC company; the name search finds Vontier ("VO..." in its name).
            return [{"ticker": "VNT", "name": "Vontier Corp"}][:limit]

    asked = []

    class FundPrices(Prices):
        def get_prices(self, ticker, start_date, end_date, **kwargs):
            asked.append(ticker)
            return [
                Price(open=270, high=271, low=269, close=270, volume=10, time="2025-10-20"),
                Price(open=290, high=291, low=289, close=290, volume=12, time="2026-10-22"),
            ]

        def name_for(self, ticker):
            return "Vanguard Mid-Cap ETF" if ticker == "VO" else "Vontier Corp"

        def instrument_type_for(self, ticker):
            return "ETF" if ticker == "VO" else "EQUITY"

    for typed in ("VO", "vo"):
        overview = SecurityOverviewService(VoCompanies(), FundPrices()).resolve(
            typed, as_of=date(2026, 10, 23)
        )
        assert overview["ticker"] == "VO"
        assert overview["name"] == "Vanguard Mid-Cap ETF"
    assert "VNT" not in asked


def test_a_short_symbol_with_no_prices_still_falls_back_to_the_name_search():
    class MissingSymbolPrices(Prices):
        def get_prices(self, ticker, start_date, end_date, **kwargs):
            if ticker != "AAPL":
                raise RuntimeError(f"no prices for {ticker}")
            return super().get_prices(ticker, start_date, end_date)

    class AppleByName(Companies):
        def search_companies(self, query, limit=8):
            return [{"ticker": "AAPL", "name": "Apple Inc."}][:limit]

    overview = SecurityOverviewService(AppleByName(), MissingSymbolPrices()).resolve(
        "APPL", as_of=date(2026, 10, 23)
    )
    assert overview["ticker"] == "AAPL"
