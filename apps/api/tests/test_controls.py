import asyncio
from uuid import UUID

import pytest
from hedge_fund.fund.spec import load_spec
from hedge_fund.signals.graham import GrahamAgent

from stockbuddy.analysis import AnalysisService
from stockbuddy.config import Settings
from stockbuddy.controls import (
    _with_prompt,
    apply_settings,
    normalize_industries,
    normalize_settings,
)
from stockbuddy.industries import DEFAULT_INDUSTRIES
from stockbuddy.personas import builtin_prompts, prompt_is_usable
from tests.test_analysis import FakeData, FakeRepository, fake_fund


class DummyLLM:
    model = "unused"

    def complete(self, system: str, user: str) -> str:
        raise RuntimeError("not called")


def studio(**overrides):
    defaults = builtin_prompts()
    payload = {
        "max_position_pct": 0.25,
        "max_industry_pct": 0.25,
        "deep_value_weight": 0.7,
        "llm_model": "claude-opus-5-5",
        "prompts": defaults,
        "defaults": defaults,
    }
    payload.update(overrides)
    return normalize_settings(**payload)


def test_industry_list_starts_filled():
    settings = studio()
    assert settings.max_industry_pct == 0.25
    assert [item.name for item in settings.industries] == [
        "Communication Services",
        "Consumer Discretionary",
        "Consumer Staples",
        "Energy",
        "Financials",
        "Health Care",
        "Industrials",
        "Information Technology",
        "Materials",
        "Real Estate",
        "Utilities",
        "Other",
    ]
    assert [item.icon for item in settings.industries] == [
        "message-circle",
        "shopping-bag",
        "shopping-cart",
        "zap",
        "landmark",
        "heart-pulse",
        "factory",
        "cpu",
        "package-open",
        "building-2",
        "plug-zap",
        "shapes",
    ]


def test_custom_industry_gets_an_automatic_unique_icon():
    industries = [(item.name, item.icon) for item in DEFAULT_INDUSTRIES]
    industries.append(("Index/ETF", "shapes"))

    normalized = normalize_industries(industries)

    assert normalized[-1].icon == "chart-line"
    assert len({item.icon for item in normalized}) == len(normalized)


def test_builtin_prompts_keep_the_response_contract():
    prompts = builtin_prompts()
    assert set(prompts) == {"graham", "buffett", "munger", "lynch", "druckenmiller"}
    assert all(prompt_is_usable(prompt) for prompt in prompts.values())
    assert "margin of safety" in prompts["graham"].lower()


def test_prompt_override_replaces_only_the_persona_voice():
    agent = _with_prompt(
        GrahamAgent,
        "Custom voice. Return bullish, bearish, neutral, and reasoning.",
    )(llm=DummyLLM())
    assert agent.get_system_prompt().startswith("Custom voice")
    assert agent.name == "graham"


def test_settings_change_sleeve_weights_and_position_cap():
    spec = apply_settings(
        load_spec("mandates/long-book.yaml"), studio(max_position_pct=0.1, deep_value_weight=0.8)
    )
    assert spec.risk.max_position_pct == 0.1
    assert [strategy.weight for strategy in spec.strategies] == [0.8, 0.2]


def test_prompt_without_the_response_contract_is_rejected():
    with pytest.raises(ValueError, match="Benjamin Graham"):
        studio(prompts={**builtin_prompts(), "graham": "x" * 50})


def test_saved_position_cap_changes_the_recorded_review():
    repository = FakeRepository()

    async def load():
        return studio(max_position_pct=0.1)

    service = AnalysisService(
        Settings(),
        repository,
        data_client=FakeData(),
        fund_factory=fake_fund,
        load_settings=load,
    )
    asyncio.run(
        service.run(
            UUID("30000000-0000-0000-0000-000000000002"),
            UUID("00000000-0000-0000-0000-000000000001"),
            {"cash": 9000, "portfolio_positions": [{"ticker": "AAPL", "shares": 10}]},
            "AAPL",
            "2024-12-31",
        )
    )
    _, decision, _, recommendation = repository.saved
    assert decision["final_weights"]["AAPL"] == pytest.approx(0.1)
    assert recommendation["label"] == "hold"
    assert recommendation["delta_shares"] == 0
