import asyncio
from uuid import UUID

import pytest
from hedge_fund.data.models import Price
from hedge_fund.fund.spec import Fund, load_spec
from hedge_fund.models import Signal

from stockbuddy.analysis import AnalysisService
from stockbuddy.config import Settings


class FakeAnalyst:
    def __init__(self, name: str, value: float) -> None:
        self._name = name
        self.value = value

    @property
    def name(self) -> str:
        return self._name

    def predict(self, ticker, date, _data_client):
        direction = "bullish" if self.value > 0 else "bearish" if self.value < 0 else "neutral"
        return Signal(
            model_name=self.name,
            ticker=ticker,
            date=date,
            value=self.value,
            reasoning=f"{self.name} test thesis",
            metadata={
                "signal": direction,
                "confidence": abs(self.value) * 100,
                "abstained": False,
            },
        )


class FakeData:
    def get_prices(self, ticker, start_date, end_date, **_kwargs):
        return [
            Price(
                open=100,
                high=100,
                low=100,
                close=100,
                volume=1000,
                time=end_date,
            )
        ]


class FakeRepository:
    def __init__(self):
        self.statuses = []
        self.saved = None

    async def set_run_status(self, run_id, status, error=None):
        self.statuses.append((run_id, status, error))

    async def save_report(self, run_id, decision, signals, recommendation):
        self.saved = (run_id, decision, signals, recommendation)
        await self.set_run_status(run_id, "completed")


VALUES = {
    "graham": 0.8,
    "buffett": 0.6,
    "munger": 0.4,
    "lynch": 0.2,
    "druckenmiller": -0.2,
}


def fake_fund(spec):
    models = {
        strategy.name: [FakeAnalyst(model.name, VALUES[model.name]) for model in strategy.models]
        for strategy in spec.strategies
    }
    return Fund(spec, models=models)


def test_long_book_mandate_is_long_only_and_omits_pead():
    spec = load_spec("mandates/long-book.yaml")
    assert [strategy.weight for strategy in spec.strategies] == [0.7, 0.3]
    assert all(strategy.blend.mode == "long_only" for strategy in spec.strategies)
    assert spec.strategies[0].model_weights["graham"] == 2
    assert "pead" not in {model.name for strategy in spec.strategies for model in strategy.models}
    assert spec.risk.max_position_pct == 0.25


def test_mocked_engine_run_persists_five_votes_and_post_risk_recommendation():
    repository = FakeRepository()
    service = AnalysisService(
        Settings(),
        repository,
        data_client=FakeData(),
        fund_factory=fake_fund,
    )
    run_id = UUID("30000000-0000-0000-0000-000000000001")
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    portfolio = {
        "cash": 9000,
        "portfolio_positions": [{"ticker": "AAPL", "shares": 10}],
    }

    asyncio.run(service.run(run_id, user_id, portfolio, "AAPL", "2024-12-31"))

    assert repository.statuses[0][1] == "running"
    assert repository.statuses[-1][1] == "completed"
    _, decision, signals, recommendation = repository.saved
    assert len(signals) == 5
    assert decision["target_weights"]["AAPL"] == pytest.approx(0.7)
    assert decision["final_weights"]["AAPL"] == pytest.approx(0.25)
    assert recommendation["label"] == "add"
    assert recommendation["target_weight"] == pytest.approx(0.25)
    assert recommendation["delta_shares"] == 15


def test_a_review_where_no_persona_reached_the_ai_explains_why():
    from stockbuddy.analysis import _ai_unreachable

    def vote(reasoning, abstained=True):
        return {"abstained": abstained, "reasoning": reasoning}

    rejected = "abstained: LLM call failed: Error code: 401 - invalid x-api-key"
    assert "rejected its API key" in _ai_unreachable([vote(rejected)] * 5)
    assert "Try again" in _ai_unreachable([vote("abstained: LLM call failed: timeout")] * 5)
    no_credits = (
        "abstained: LLM call failed: Error code: 429 - {'error': {'message': 'You have no "
        "credits remaining. Add credits at https://platform.openai.com/settings/organization/"
        "billing/.', 'type': 'insufficient_quota', 'code': 'credit_balance_exhausted'}}"
    )
    assert _ai_unreachable([vote(no_credits)] * 5) == (
        "The AI service account (OpenAI) has run out of credits, so no persona could answer. "
        "An admin needs to add credits in the OpenAI billing settings."
    )
    # One persona answering, or abstaining for its own reasons, is a normal review.
    assert _ai_unreachable([vote(rejected)] * 4 + [vote("bullish", abstained=False)]) is None
    assert _ai_unreachable([vote("no filings near the date")] * 5) is None
    assert _ai_unreachable([]) is None


def test_the_key_check_names_the_model_and_both_fixes(monkeypatch):
    import asyncio

    from stockbuddy import analysis as module
    from stockbuddy.analysis import AnalysisService, review_models

    async def rejected(provider, settings):
        assert provider == "Anthropic"
        return "Anthropic rejected the API key."

    class Studio:
        llm_model = "claude-opus-5-5"

    async def load():
        return Studio()

    monkeypatch.setattr(module, "_key_problem", rejected)
    service = AnalysisService(Settings(), None, load_settings=load)
    reason = asyncio.run(service.ready())
    assert reason == (
        "The review model in Admin → Studio is claude-opus-5-5, which uses Anthropic: "
        "Anthropic rejected the API key. Fix the Anthropic key in Admin → Connections, "
        "or pick an OpenAI model in Admin → Studio."
    )
    providers = {model["id"]: model["provider"] for model in review_models()}
    assert providers["claude-opus-5-5"] == "Anthropic"
    assert providers["gpt-6-sol"] == "OpenAI"


def test_review_blockers_explain_missing_or_too_few_filings():
    import asyncio

    from stockbuddy.analysis import AnalysisService
    from stockbuddy.providers import EdgarError

    class Client:
        def get_financial_metrics(self, ticker, end_date, period="ttm", limit=20):
            if ticker == "TRUST":
                raise EdgarError("SEC companyfacts payload has no us-gaap facts")
            if ticker == "DOWN":
                raise ConnectionError("SEC unreachable")
            return {"VOO": [], "SPCX": [object()] * 2, "AAPL": [object()] * 4}[ticker]

    service = AnalysisService(Settings(), None, data_client=Client())
    blockers = asyncio.run(
        service.review_blockers(["VOO", "SPCX", "AAPL", "TRUST", "DOWN"], "2026-10-25")
    )
    assert "may be an ETF or fund" in blockers["VOO"]
    assert blockers["SPCX"].startswith("Only 2 of 4 quarters of financials are filed so far")
    assert "funds and trusts" in blockers["TRUST"]
    assert blockers["AAPL"] is None
    assert blockers["DOWN"] is None  # an outage never blocks a review


def test_empty_ai_credits_refuse_the_next_reviews_before_a_token_is_used(monkeypatch):
    import stockbuddy.analysis as module

    checked = []

    async def key_fine(provider, settings):
        checked.append(provider)
        return None

    monkeypatch.setattr(module, "_key_problem", key_fine)
    repository = FakeRepository()
    service = AnalysisService(Settings(), repository)
    quota = "abstained: LLM call failed: Error code: 429 - insufficient_quota"
    signals = [{"abstained": True, "reasoning": quota}] * 5
    monkeypatch.setattr(service, "_analyze", lambda *args: ({}, signals, {}))
    run_id = UUID("30000000-0000-0000-0000-000000000009")
    asyncio.run(service.run(run_id, UUID(int=1), {}, "AAPL", "2026-10-27"))

    assert repository.statuses[-1][1] == "failed"
    assert "run out of credits" in repository.statuses[-1][2]
    # The next review is refused up front, without asking the provider again.
    assert "run out of credits" in asyncio.run(service.ready())
    assert checked == []
