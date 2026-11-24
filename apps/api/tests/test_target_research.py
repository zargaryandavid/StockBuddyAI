import json

import httpx
import pytest

from stockbuddy.analyst_targets import AnalystTargets
from stockbuddy.target_research import ResearchFailed, TargetResearch, parse_research


class FakeCache:
    """market_cache in memory; `ages` can make an entry look old (seconds)."""

    def __init__(self):
        self.rows = {}
        self.ages = {}

    def get_rows(self, keys):
        return {key: (self.rows[key], self.ages.get(key, 0)) for key in keys if key in self.rows}

    def get_many(self, keys, ttl=0):
        return {
            key: value for key, (value, age) in self.get_rows(keys).items() if age < (ttl or 1e12)
        }

    def put_many(self, entries):
        self.rows.update(entries)
        for key in entries:
            self.ages.pop(key, None)


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


def plan_limited_fmp():
    return httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(402, text="Premium"))
    )


def test_new_stock_shows_analyzing_then_everyone_gets_it_instantly():
    cache, research = FakeCache(), FakeResearch()
    service = AnalystTargets("key", cache, plan_limited_fmp(), research)
    found, analyzing = service.lookup(["XYZ", "VOO"])
    assert found == {"XYZ": None, "VOO": None} and analyzing == ["VOO", "XYZ"]

    done = service.research_now(analyzing)
    assert done["XYZ"]["source"] == "web research: news" and done["VOO"] is None

    # Another client asking later gets both instantly, with nothing left to analyse.
    other = AnalystTargets("key", cache, plan_limited_fmp(), research)
    found, analyzing = other.lookup(["XYZ", "VOO"])
    assert found["XYZ"]["target"] == 50.0 and found["VOO"] is None and analyzing == []
    assert research.calls == [["VOO", "XYZ"]]


def test_a_month_old_target_still_shows_while_it_is_refreshed():
    cache, research = FakeCache(), FakeResearch()
    cache.rows["target_ai:XYZ"] = {"v": {"target": 40.0, "source": "old", "as_of": "Oct"}}
    cache.ages["target_ai:XYZ"] = 31 * 24 * 3600
    service = AnalystTargets("", cache, research=research)
    found, analyzing = service.lookup(["XYZ"])
    assert found["XYZ"]["target"] == 40.0 and analyzing == ["XYZ"]
    assert service.research_now(["XYZ"])["XYZ"]["target"] == 50.0


def test_one_research_at_a_time_and_a_pause_after_failure():
    cache, research = FakeCache(), FakeResearch()
    cache.rows["target_ai_lock:XYZ"] = {"v": True}  # another request is on it
    assert AnalystTargets("", cache, research=research).research_now(["XYZ"]) == {}
    assert research.calls == []

    failing = FakeResearch(fail=True)
    service = AnalystTargets("", FakeCache(), research=failing)
    with pytest.raises(ResearchFailed):
        service.research_now(["ABC"])
    with pytest.raises(ResearchFailed):
        service.research_now(["ABC"])
    assert len(failing.calls) == 1
