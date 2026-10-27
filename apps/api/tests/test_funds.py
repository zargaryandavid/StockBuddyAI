import requests
from fastapi.testclient import TestClient

from stockbuddy.main import app, current_user
from stockbuddy.providers.yahoo import YahooPriceClient
from tests.test_api import user_override

VOO_SUMMARY = {
    "quoteSummary": {
        "result": [
            {
                "topHoldings": {
                    "holdings": [
                        {
                            "symbol": "NVDA",
                            "holdingName": "NVIDIA Corp",
                            "holdingPercent": {"raw": 0.0839, "fmt": "8.39%"},
                        },
                        {
                            "symbol": "aapl",
                            "holdingName": "Apple Inc",
                            "holdingPercent": {"raw": 0.07},
                        },
                        {"symbol": "", "holdingPercent": {"raw": 0.01}},
                    ],
                    "sectorWeightings": [
                        {"technology": {"raw": 0.4048}},
                        {"healthcare": {"raw": 0.0926}},
                        {"realestate": {"raw": 0.02}},
                        {"consumer_cyclical": {"raw": 0.1}},
                        {"energy": {"raw": 0}},
                        {"something_new": {"raw": 0.01}},
                    ],
                }
            }
        ],
        "error": None,
    }
}


class FakeResponse:
    def __init__(self, payload=None, status_code=200, text="") -> None:
        self.payload = payload
        self.status_code = status_code
        self.text = text

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")

    def json(self):
        return self.payload


class FakeSession:
    """Answers the cookie, crumb and quoteSummary calls; summaries is a queue of replies."""

    def __init__(self, summaries, crumbs=("crumb-1", "crumb-2")) -> None:
        self.headers: dict[str, str] = {}
        self.summaries = list(summaries)
        self.crumbs = list(crumbs)
        self.calls: list[tuple[str, dict | None]] = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        if url == YahooPriceClient.COOKIE_URL:
            return FakeResponse(status_code=404)
        if url == YahooPriceClient.CRUMB_URL:
            return FakeResponse(text=self.crumbs.pop(0))
        reply = self.summaries.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    def summary_calls(self):
        return [params for url, params in self.calls if "quoteSummary" in url]


def test_fund_holdings_parses_top_holdings_and_maps_sectors():
    session = FakeSession([FakeResponse(VOO_SUMMARY)])
    client = YahooPriceClient(session=session)

    data = client.fund_holdings("voo")

    assert data["holdings"] == [
        {"ticker": "NVDA", "name": "NVIDIA Corp", "weight": 0.0839},
        {"ticker": "AAPL", "name": "Apple Inc", "weight": 0.07},
    ]
    assert data["sectors"] == {
        "Information Technology": 0.4048,
        "Health Care": 0.0926,
        "Real Estate": 0.02,
        "Consumer Discretionary": 0.1,
        "Unknown": 0.01,
    }
    assert session.summary_calls()[0] == {"modules": "topHoldings", "crumb": "crumb-1"}
    assert session.calls[-1][0].endswith("/quoteSummary/VOO")


def test_fund_holdings_are_cached_and_the_crumb_is_reused():
    session = FakeSession([FakeResponse(VOO_SUMMARY), FakeResponse(VOO_SUMMARY)])
    client = YahooPriceClient(session=session)

    first = client.fund_holdings("VOO")
    again = client.fund_holdings("voo")
    client.fund_holdings("SPY")

    assert first == again
    assert len(session.summary_calls()) == 2
    assert [url for url, _ in session.calls].count(YahooPriceClient.CRUMB_URL) == 1


def test_fund_holdings_refresh_the_crumb_once_when_it_is_rejected():
    session = FakeSession([FakeResponse(status_code=401), FakeResponse(VOO_SUMMARY)])
    client = YahooPriceClient(session=session)

    data = client.fund_holdings("VOO")

    assert data["holdings"][0]["ticker"] == "NVDA"
    assert [params["crumb"] for params in session.summary_calls()] == ["crumb-1", "crumb-2"]


def test_fund_holdings_return_none_for_stocks_and_failures():
    stock = {"quoteSummary": {"result": [{}], "error": None}}
    session = FakeSession(
        [
            FakeResponse(stock),
            FakeResponse(status_code=404),
            requests.ConnectionError("down"),
            FakeResponse(VOO_SUMMARY),
        ]
    )
    client = YahooPriceClient(session=session)

    assert client.fund_holdings("AAPL") is None
    assert client.fund_holdings("NOPE") is None
    assert client.fund_holdings("VOO") is None
    # A failed request is not cached; the next call tries again.
    assert client.fund_holdings("VOO")["holdings"][0]["ticker"] == "NVDA"


class FundPrices:
    def __init__(self) -> None:
        self.asked: list[str] = []

    def fund_holdings(self, ticker):
        self.asked.append(ticker)
        if ticker == "BAD":
            raise RuntimeError("boom")
        if ticker == "VOO":
            return {
                "holdings": [{"ticker": "NVDA", "name": "NVIDIA Corp", "weight": 0.0839}],
                "sectors": {"Information Technology": 0.4048},
            }
        return None


class Market:
    def __init__(self) -> None:
        self.prices = FundPrices()


def test_fund_holdings_endpoint_returns_only_funds_with_data():
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            market = Market()
            app.state.market = market
            response = client.get(
                "/api/funds/holdings",
                params={"tickers": "voo,AAPL,BAD,VOO"},
                headers={"Authorization": "Bearer test-token"},
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {
        "VOO": {
            "holdings": [{"ticker": "NVDA", "name": "NVIDIA Corp", "weight": 0.0839}],
            "sectors": {"Information Technology": 0.4048},
        }
    }
    assert sorted(market.prices.asked) == ["AAPL", "BAD", "VOO"]


def test_fund_holdings_endpoint_caps_the_ticker_count():
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.market = Market()
            response = client.get(
                "/api/funds/holdings",
                params={"tickers": ",".join(f"F{index}" for index in range(31))},
                headers={"Authorization": "Bearer test-token"},
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422


def test_fund_holdings_endpoint_requires_sign_in():
    with TestClient(app) as client:
        response = client.get("/api/funds/holdings", params={"tickers": "VOO"})
    assert response.status_code == 401
