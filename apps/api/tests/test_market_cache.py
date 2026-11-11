from datetime import UTC, datetime, timedelta

import httpx
from hedge_fund.data.models import CompanyFacts

from stockbuddy.config import Settings
from stockbuddy.market_cache import CachedCompanies, MarketCache


class FakeStore:
    """The market_cache table in memory."""

    def __init__(self):
        self.rows = {}
        self.reads = 0

    def get_many(self, keys, ttl=0):
        self.reads += 1
        return {key: self.rows[key] for key in keys if key in self.rows}

    def put_many(self, entries):
        self.rows.update(entries)


class FakeSec:
    def __init__(self):
        self.calls = []

    def search_companies(self, query, limit=8):
        self.calls.append(("search", query))
        return [{"ticker": query.upper(), "name": "Visa Inc."}]

    def get_company_facts(self, ticker):
        self.calls.append(("facts", ticker))
        return CompanyFacts(ticker=ticker, name="Visa Inc.", industry="Business Services")

    def get_financial_metrics(self, ticker, end_date, period="ttm", limit=20):
        self.calls.append(("metrics", ticker))
        return []

    def fund_holdings(self, ticker):
        return ["passed through"]


def test_sec_is_asked_once_then_every_server_copy_reads_the_database():
    store, sec = FakeStore(), FakeSec()
    first = CachedCompanies(sec, store)
    assert first.get_company_facts("V").name == "Visa Inc."
    assert first.search_companies("V", limit=1)[0]["ticker"] == "V"
    first.get_financial_metrics("V", "2026-11-11", limit=4)
    assert len(sec.calls) == 3

    # A new server copy (empty memory) answers from the database, without the SEC.
    second = CachedCompanies(sec, store)
    second.preload(["V"])
    reads = store.reads
    assert second.get_company_facts("V").industry == "Business Services"
    assert second.search_companies("V", limit=1) == [{"ticker": "V", "name": "Visa Inc."}]
    assert second.get_financial_metrics("V", "2026-11-12", limit=4) == []
    assert len(sec.calls) == 3
    assert store.reads == reads  # all three came from the one preload read
    assert second.fund_holdings("VOO") == ["passed through"]


def test_a_company_the_sec_does_not_know_is_remembered_too():
    store, sec = FakeStore(), FakeSec()
    sec.get_company_facts = lambda ticker: sec.calls.append(("facts", ticker))
    first = CachedCompanies(sec, store)
    assert first.get_company_facts("VOO") is None
    assert CachedCompanies(sec, store).get_company_facts("VOO") is None
    assert sec.calls == [("facts", "VOO")]


def _settings():
    return Settings(supabase_url="https://db.example", supabase_service_role_key="service")


def test_old_entries_are_not_used_and_an_unreachable_database_falls_back_to_the_sec():
    now = datetime.now(UTC)

    def answer(request):
        return httpx.Response(
            200,
            json=[
                {"key": "facts:V", "value": {"v": None}, "fetched_at": now.isoformat()},
                {
                    "key": "facts:MA",
                    "value": {"v": None},
                    "fetched_at": (now - timedelta(days=2)).isoformat(),
                },
            ],
        )

    cache = MarketCache(_settings(), httpx.Client(transport=httpx.MockTransport(answer)))
    assert cache.get_many(["facts:V", "facts:MA"]) == {"facts:V": {"v": None}}

    def down(request):
        raise httpx.ConnectError("no route")

    broken = MarketCache(_settings(), httpx.Client(transport=httpx.MockTransport(down)))
    assert broken.get_many(["facts:V"]) == {}
    broken.put_many({"facts:V": {"v": None}})  # logs, does not raise
    sec = FakeSec()
    assert CachedCompanies(sec, broken).get_company_facts("V").name == "Visa Inc."
