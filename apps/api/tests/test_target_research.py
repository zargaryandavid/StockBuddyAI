import json

import httpx
import pytest

from stockbuddy.analyst_targets import AnalystTargets
from stockbuddy.target_research import ResearchFailed, TargetResearch, parse_research


class FakeCache:
    def __init__(self):
        self.rows = {}

    def get_many(self, keys, ttl=0):
        return {key: self.rows[key] for key in keys if key in self.rows}

    def put_many(self, entries):
        self.rows.update(entries)


def test_keeps_only_asked_symbols_with_real_targets():
    text = json.dumps(
        {
            "targets": [
                {"symbol": "vrt", "target": 324, "source": "Benzinga", "as_of": "Nov 2026"},
                {"symbol": "VOO", "target": None, "source": "", "as_of": ""},
                {"symbol": "ZZZ", "target": 5, "source": "x", "as_of": ""},
                {"symbol": "BE", "target": -3, "source": "x", "as_of": ""},
            ]
        }
    )
    assert parse_research(text, ["VRT", "VOO", "BE"]) == {
        "VRT": {"target": 324.0, "source": "Benzinga", "as_of": "Nov 2026"},
        "VOO": None,
        "BE": None,
    }
    with pytest.raises(ResearchFailed):
        parse_research("no json here", ["VRT"])


def test_sends_only_tickers_with_web_search_and_no_storage():
    sent = {}

    def handle(request):
        sent.update(json.loads(request.content))
        body = {"targets": [{"symbol": "VRT", "target": 324, "source": "S", "as_of": "D"}]}
        return httpx.Response(200, json={"output_text": json.dumps(body)})

    client = httpx.Client(transport=httpx.MockTransport(handle))
    found = TargetResearch("sk", "model-x", client).research(["VRT"])
    assert found["VRT"]["target"] == 324.0
    assert sent["store"] is False and sent["tools"] == [{"type": "web_search"}]
    assert "VRT" in sent["input"] and sent["model"] == "model-x"


class FakeResearch:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def research(self, symbols):
        self.calls.append(list(symbols))
        if self.fail:
            raise ResearchFailed("no credits")
        return {
            s: ({"target": 50.0, "source": "news", "as_of": "Nov 2026"} if s != "VOO" else None)
            for s in symbols
        }


def test_stocks_fmp_skips_are_researched_once_then_shared_for_a_week():
    def plan_limited(request):
        return httpx.Response(402, text="Premium Query Parameter")

    cache, research = FakeCache(), FakeResearch()
    fmp = httpx.Client(transport=httpx.MockTransport(plan_limited))
    first = AnalystTargets("key", cache, fmp, research).get_many(["XYZ", "VOO"])
    assert first["XYZ"]["approximate"] is True
    assert first["XYZ"]["source"] == "web research: news"
    assert first["VOO"] is None
    again = AnalystTargets("key", cache, fmp, research).get_many(["XYZ", "VOO"])
    assert again["XYZ"]["target"] == 50.0
    assert research.calls == [["VOO", "XYZ"]]  # VOO's "no coverage" was remembered too


def test_a_failed_research_pauses_retries_instead_of_slowing_every_page():
    cache, research = FakeCache(), FakeResearch(fail=True)
    service = AnalystTargets("", cache, research=research)
    assert service.get_many(["XYZ"]) == {"XYZ": None}
    assert service.get_many(["XYZ"]) == {"XYZ": None}
    assert len(research.calls) == 1
    assert cache.rows == {}
