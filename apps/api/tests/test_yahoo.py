from datetime import UTC, datetime

import pytest
import requests

from stockbuddy.providers.yahoo import YahooPriceClient, YahooPriceError


class FakeResponse:
    def __init__(self, payload=None, error: Exception | None = None) -> None:
        self.payload = payload
        self.error = error

    def raise_for_status(self) -> None:
        if self.error:
            raise self.error

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, response: FakeResponse) -> None:
        self.headers: dict[str, str] = {}
        self.response = response
        self.request: dict | None = None

    def get(self, url, params, timeout):
        self.request = {"url": url, "params": params, "timeout": timeout}
        return self.response


def test_get_prices_requests_and_parses_daily_chart():
    timestamps = [
        int(datetime(2026, 10, 21, tzinfo=UTC).timestamp()),
        int(datetime(2026, 10, 22, tzinfo=UTC).timestamp()),
    ]
    session = FakeSession(
        FakeResponse(
            {
                "chart": {
                    "result": [
                        {
                            "meta": {
                                "longName": "Apple Inc.",
                                "instrumentType": "EQUITY",
                            },
                            "timestamp": timestamps,
                            "indicators": {
                                "quote": [
                                    {
                                        "open": [268, 270],
                                        "high": [271, 275],
                                        "low": [267, 269],
                                        "close": [270, 274],
                                        "volume": [1000, 1200],
                                    }
                                ]
                            },
                        }
                    ]
                }
            }
        )
    )
    client = YahooPriceClient(session=session, timeout=12)

    prices = client.get_prices("aapl", "2026-10-01", "2026-10-23")

    assert [price.time for price in prices] == ["2026-10-21", "2026-10-22"]
    assert prices[-1].close == 274
    assert session.request["url"].endswith("/AAPL")
    assert session.request["params"]["interval"] == "1d"
    assert session.request["timeout"] == 12
    assert client.name_for("AAPL") == "Apple Inc."
    assert client.instrument_type_for("AAPL") == "EQUITY"


def test_get_prices_returns_empty_for_missing_result():
    client = YahooPriceClient(session=FakeSession(FakeResponse({"chart": {"result": []}})))

    assert client.get_prices("UNKNOWN", "2026-10-01", "2026-10-23") == []


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(error=requests.HTTPError("unavailable")),
        FakeResponse({"unexpected": "response"}),
    ],
)
def test_get_prices_raises_for_provider_or_malformed_data(response):
    client = YahooPriceClient(session=FakeSession(response))

    with pytest.raises(YahooPriceError):
        client.get_prices("AAPL", "2026-10-01", "2026-10-23")


def test_search_symbol_picks_first_listed_equity_or_fund():
    session = FakeSession(
        FakeResponse(
            {
                "quotes": [
                    {"symbol": "GOOG.MX", "quoteType": "EQUITY", "shortname": "Alphabet MX"},
                    {"symbol": "XNEWS", "quoteType": "NEWS"},
                    {"symbol": "GOOG", "quoteType": "EQUITY", "longname": "Alphabet Inc."},
                ]
            }
        )
    )

    found = YahooPriceClient(session=session).search_symbol("Google")

    assert found == {"ticker": "GOOG", "name": "Alphabet Inc."}
    assert session.request["url"] == YahooPriceClient.SEARCH_URL
    assert session.request["params"]["q"] == "Google"


def test_search_symbol_returns_none_without_a_listed_match():
    session = FakeSession(FakeResponse({"quotes": []}))

    assert YahooPriceClient(session=session).search_symbol("zzzz") is None
