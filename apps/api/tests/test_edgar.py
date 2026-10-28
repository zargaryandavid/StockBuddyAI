import json
from pathlib import Path

import pytest
from hedge_fund.data.models import Price

from stockbuddy.providers.composite import PublicDataClient
from stockbuddy.providers.edgar import EdgarClient, EdgarError

FIXTURES = Path(__file__).parent / "fixtures" / "sec"
PERIODS = [
    ("0001-23-000001", "2023-05-01", "2023-03-31", "10-Q", 2023, "Q1"),
    ("0001-23-000002", "2023-08-01", "2023-06-30", "10-Q", 2023, "Q2"),
    ("0001-23-000003", "2023-11-01", "2023-09-30", "10-Q", 2023, "Q3"),
    ("0001-23-000004", "2024-02-01", "2023-12-31", "10-K", 2023, "FY"),
    ("0001-24-000005", "2024-05-01", "2024-03-31", "10-Q", 2024, "Q1"),
    ("0001-24-000006", "2024-08-01", "2024-06-30", "10-Q", 2024, "Q2"),
    ("0001-24-000007", "2024-11-01", "2024-09-30", "10-Q", 2024, "Q3"),
    ("0001-24-000008", "2025-02-01", "2024-12-31", "10-K", 2024, "FY"),
]


def duration(values, unit="USD"):
    entries = []
    for value, (accn, filed, end, form, fy, fp) in zip(values, PERIODS, strict=True):
        entries.append(
            {
                "accn": accn,
                "filed": filed,
                "start": f"{fy}-01-01",
                "end": end,
                "form": form,
                "fy": fy,
                "fp": fp,
                "val": value,
            }
        )
    return {"units": {unit: entries}}


def instant(values, unit="USD"):
    entries = []
    for value, (accn, filed, end, form, fy, fp) in zip(values, PERIODS, strict=True):
        entries.append(
            {
                "accn": accn,
                "filed": filed,
                "end": end,
                "form": form,
                "fy": fy,
                "fp": fp,
                "val": value,
            }
        )
    return {"units": {unit: entries}}


@pytest.fixture
def companyfacts():
    return {
        "facts": {
            "us-gaap": {
                "RevenueFromContractWithCustomerExcludingAssessedTax": duration(
                    [100, 220, 360, 500, 150, 320, 510, 720]
                ),
                "GrossProfit": duration([40, 88, 144, 200, 60, 128, 204, 288]),
                "OperatingIncomeLoss": duration([20, 44, 72, 100, 30, 64, 102, 144]),
                "NetIncomeLoss": duration([10, 22, 36, 50, 15, 32, 51, 72]),
                "NetCashProvidedByUsedInOperatingActivities": duration(
                    [12, 27, 45, 64, 19, 41, 66, 94]
                ),
                "PaymentsToAcquirePropertyPlantAndEquipment": duration([2, 5, 9, 14, 3, 7, 12, 18]),
                "EarningsPerShareDiluted": duration(
                    [1, 2.2, 3.6, 5, 1.5, 3.2, 5.1, 7.2], "USD/shares"
                ),
                "StockholdersEquity": instant([200, 205, 210, 220, 230, 240, 250, 260]),
                "LongTermDebt": instant([50] * 8),
                "AssetsCurrent": instant([120] * 8),
                "LiabilitiesCurrent": instant([60] * 8),
            },
            "dei": {"EntityCommonStockSharesOutstanding": instant([100] * 8, "shares")},
        }
    }


@pytest.fixture
def edgar(tmp_path, companyfacts, monkeypatch):
    client = EdgarClient("MyPortfolioBuddy test@example.com", cache_dir=tmp_path)
    tickers = json.loads((FIXTURES / "company_tickers.json").read_text())
    submissions = json.loads((FIXTURES / "submissions.json").read_text())

    def fake_json(url, _filename, max_age=None):
        del max_age
        if "company_tickers" in url:
            return tickers
        if "submissions" in url:
            return submissions
        return companyfacts

    monkeypatch.setattr(client, "_json", fake_json)
    return client


def test_search_companies_accepts_ticker_or_company_name(edgar):
    assert edgar.search_companies("test") == [{"ticker": "TEST", "name": "Example Corporation"}]
    assert edgar.search_companies("Example") == [{"ticker": "TEST", "name": "Example Corporation"}]


def test_builds_ttm_metrics_and_filters_by_filing_date(edgar):
    rows = edgar.get_financial_metrics("TEST", "2024-11-01", limit=20)

    assert len(rows) == 4
    latest = rows[0]
    assert latest.report_period == "2024-09-30"
    assert latest.filing_date == "2024-11-01"
    assert latest.net_margin == pytest.approx(0.1)
    assert latest.gross_margin == pytest.approx(0.4)
    assert latest.current_ratio == pytest.approx(2)
    assert latest.debt_to_equity == pytest.approx(0.2)
    assert latest.book_value_per_share == pytest.approx(2.5)
    assert latest.free_cash_flow_per_share == pytest.approx(0.68)
    assert edgar.shares_for("TEST", latest.report_period, latest.filing_date) == 100


def test_unknown_ticker_returns_no_data(edgar):
    assert edgar.get_company_facts("MISSING") is None
    assert edgar.get_financial_metrics("MISSING", "2025-01-01") == []


class FakePrices:
    def get_prices(self, ticker, start_date, end_date, **_kwargs):
        return [Price(open=10, high=10, low=10, close=10, volume=1, time=end_date)]


def test_composite_enriches_filing_rows_with_point_in_time_price(edgar):
    client = PublicDataClient(edgar, FakePrices())
    latest = client.get_financial_metrics("TEST", "2024-11-01", limit=1)[0]

    assert latest.market_cap == 1000
    assert latest.price_to_earnings_ratio == pytest.approx(10 / 6.5)


def test_composite_accepts_the_cache_layers_positional_interval(edgar):
    # hedge_fund's CachedDataClient calls get_prices(ticker, start, end, interval, multiplier).
    client = PublicDataClient(edgar, FakePrices())

    prices = client.get_prices("TEST", "2026-10-01", "2026-10-23", "day", 1)

    assert prices[0].close == 10


class ErrorResponse:
    status_code = 500

    def json(self):
        return {}


class ErrorSession:
    headers = {}

    def get(self, _url, timeout):
        assert timeout == 30
        return ErrorResponse()


def test_transport_errors_raise_instead_of_becoming_empty(tmp_path):
    client = EdgarClient(
        "MyPortfolioBuddy test@example.com", cache_dir=tmp_path, session=ErrorSession()
    )
    with pytest.raises(EdgarError, match="HTTP 500"):
        client.get_company_facts("TEST")
