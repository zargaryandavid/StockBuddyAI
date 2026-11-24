from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient

from stockbuddy.analyst_targets import AnalystTargets, TargetsUnavailable, parse_consensus
from stockbuddy.main import app, current_user


class FakeCache:
    def __init__(self):
        self.rows = {}

    def get_many(self, keys, ttl=0):
        return {key: self.rows[key] for key in keys if key in self.rows}

    def put_many(self, entries):
        self.rows.update(entries)


def fmp(answers):
    calls = []

    def handle(request):
        symbol = request.url.params["symbol"]
        calls.append(symbol)
        status, body = answers[symbol]
        return httpx.Response(status, json=body)

    return httpx.Client(transport=httpx.MockTransport(handle)), calls


def test_parses_the_consensus_and_ignores_missing_coverage():
    row = [{"symbol": "AAPL", "targetHigh": 300, "targetLow": 180, "targetConsensus": 252.5}]
    assert parse_consensus(row) == {"target": 252.5, "high": 300.0, "low": 180.0}
    assert parse_consensus([]) is None
    assert parse_consensus([{"symbol": "VOO", "targetConsensus": 0}]) is None


def test_targets_are_asked_once_then_read_from_the_shared_cache():
    client, calls = fmp(
        {
            "AAPL": (200, [{"targetConsensus": 250, "targetHigh": 300, "targetLow": 200}]),
            "VOO": (200, []),
            "MU": (503, {"error": "busy"}),
        }
    )
    cache = FakeCache()
    found = AnalystTargets("key", cache, client).get_many(["aapl", "VOO", "MU"])
    assert found == {
        "AAPL": {"target": 250.0, "high": 300.0, "low": 200.0},
        "MU": None,
        "VOO": None,
    }
    # A fund's "no target" is remembered; a failed lookup (MU) is tried again next time.
    assert set(cache.rows) == {"target:AAPL", "target:VOO"}

    again = AnalystTargets("key", cache, client).get_many(["AAPL", "VOO", "MU"])
    assert again["AAPL"]["target"] == 250.0
    assert calls == ["AAPL", "MU", "VOO", "MU"] or sorted(calls) == ["AAPL", "MU", "MU", "VOO"]


def test_without_a_key_only_cached_targets_are_given():
    cache = FakeCache()
    cache.rows["target:AAPL"] = {"v": {"target": 250.0, "high": None, "low": None}}
    assert AnalystTargets("", cache).get_many(["AAPL"]) == {
        "AAPL": {"target": 250.0, "high": None, "low": None}
    }
    with pytest.raises(TargetsUnavailable):
        AnalystTargets("", cache).get_many(["AAPL", "MSFT"])


class FakeTargets:
    def __init__(self, error=None):
        self.error = error

    def get_many(self, symbols):
        if self.error:
            raise TargetsUnavailable(self.error)
        return {symbol: {"target": 100.0, "high": None, "low": None} for symbol in symbols}


def run(service, path):
    app.dependency_overrides[current_user] = lambda: UUID(int=1)
    try:
        with TestClient(app) as client:
            app.state.targets = service
            return client.get(path, headers={"Authorization": "Bearer t"})
    finally:
        app.dependency_overrides.clear()


def test_endpoint_returns_targets_or_says_a_key_is_needed():
    ok = run(FakeTargets(), "/api/securities/targets?tickers=msft,AAPL")
    assert ok.json() == {
        "configured": True,
        "targets": {
            "AAPL": {"target": 100.0, "high": None, "low": None},
            "MSFT": {"target": 100.0, "high": None, "low": None},
        },
    }
    missing = run(FakeTargets("Add a key"), "/api/securities/targets?tickers=AAPL")
    assert missing.json() == {"configured": False, "message": "Add a key", "targets": {}}
