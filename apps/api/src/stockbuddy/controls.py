from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from hedge_fund.fund.spec import Fund, FundSpec
from hedge_fund.llm.client import make_llm
from hedge_fund.signals import ALPHA_MODEL_REGISTRY, LLMAgent

from stockbuddy.industries import DEFAULT_INDUSTRIES, suggest_industry_icon
from stockbuddy.personas import PERSONA_BY_NAME, PERSONAS, prompt_is_usable


@dataclass(frozen=True)
class PersonaSetting:
    persona: str
    display_name: str
    strategy: str
    prompt: str
    default_prompt: str


@dataclass(frozen=True)
class IndustrySetting:
    name: str
    icon: str
    sort_order: int


@dataclass(frozen=True)
class StudioSettings:
    max_position_pct: float
    max_industry_pct: float
    deep_value_weight: float
    trajectory_weight: float
    llm_model: str
    industries: tuple[IndustrySetting, ...]
    personas: tuple[PersonaSetting, ...]
    use_transaction_history_analytics: bool = True
    # Cash share portfolios without their own Min cash should keep.
    min_cash_pct: float = 0.05
    # Uses per person per day of each AI feature; 0 turns the feature off.
    daily_wish_checks: int = 100
    daily_screenshot_imports: int = 20
    daily_ai_reviews: int = 10

    def daily_limit(self, feature: str) -> int:
        return {
            "wish_check": self.daily_wish_checks,
            "screenshot_import": self.daily_screenshot_imports,
            "ai_review": self.daily_ai_reviews,
        }[feature]

    def prompt_for(self, persona: str) -> str | None:
        for item in self.personas:
            if item.persona == persona and item.prompt != item.default_prompt:
                return item.prompt
            if item.persona == persona:
                return item.prompt
        return None


def split_sleeve_weights(deep_value_weight: float) -> tuple[Decimal, Decimal]:
    deep = Decimal(str(deep_value_weight)).quantize(Decimal("0.0001"))
    if deep < Decimal("0.0500") or deep > Decimal("0.9500"):
        raise ValueError("Deep value weight must stay between 5% and 95%")
    trajectory = (Decimal("1.0000") - deep).quantize(Decimal("0.0001"))
    if deep + trajectory != Decimal("1.0000"):
        raise ValueError("Sleeve weights must add up to 100%")
    return deep, trajectory


def _percent(value: float, label: str) -> Decimal:
    amount = Decimal(str(value)).quantize(Decimal("0.0001"))
    if amount <= 0 or amount > 1:
        raise ValueError(f"{label} must be between 0% and 100%")
    return amount


def normalize_industries(industries: list[tuple[str, str]]) -> tuple[IndustrySetting, ...]:
    if not industries:
        raise ValueError("Add at least one industry")
    order = {item.name: item.sort_order for item in DEFAULT_INDUSTRIES}
    seen: set[str] = set()
    used_icons: set[str] = set()
    normalized: list[IndustrySetting] = []
    for raw_name, _raw_icon in industries:
        name = raw_name.strip()
        if not name or len(name) > 80:
            raise ValueError("Industry names must be between 1 and 80 characters")
        folded = name.casefold()
        if folded in seen:
            raise ValueError(f"{name} is listed more than once")
        seen.add(folded)
        icon = suggest_industry_icon(name, used_icons)
        used_icons.add(icon)
        normalized.append(
            IndustrySetting(
                name=name,
                icon=icon,
                sort_order=order.get(name, 100 + len(normalized)),
            )
        )
    return tuple(normalized)


def normalize_settings(
    *,
    max_position_pct: float,
    max_industry_pct: float,
    deep_value_weight: float,
    llm_model: str,
    use_transaction_history_analytics: bool = True,
    min_cash_pct: float = 0.05,
    prompts: dict[str, str],
    defaults: dict[str, str],
    industries: list[tuple[str, str]] | None = None,
    daily_wish_checks: int = 100,
    daily_screenshot_imports: int = 20,
    daily_ai_reviews: int = 10,
) -> StudioSettings:
    for label, value in (
        ("Daily wish checks", daily_wish_checks),
        ("Daily screenshot imports", daily_screenshot_imports),
        ("Daily AI reviews", daily_ai_reviews),
    ):
        if not 0 <= value <= 10000:
            raise ValueError(f"{label} must be between 0 and 10000")
    position = _percent(max_position_pct, "Maximum position")
    industry_cap = _percent(max_industry_pct, "Industry position")
    if not 0 <= min_cash_pct <= 1:
        raise ValueError("Minimum cash must be between 0% and 100%")
    deep, trajectory = split_sleeve_weights(deep_value_weight)
    model = llm_model.strip()
    if not model or len(model) > 80 or any(character.isspace() for character in model):
        raise ValueError("Model id must be a single token of at most 80 characters")
    missing = [persona.persona for persona in PERSONAS if persona.persona not in prompts]
    if missing:
        raise ValueError(f"Missing prompts for {', '.join(missing)}")
    personas: list[PersonaSetting] = []
    for persona in PERSONAS:
        prompt = prompts[persona.persona].strip()
        if not 40 <= len(prompt) <= 12000:
            raise ValueError(
                f"{persona.display_name} prompt must be between 40 and 12000 characters"
            )
        if not prompt_is_usable(prompt):
            raise ValueError(
                f"{persona.display_name} prompt must still ask for bullish, bearish, "
                "neutral, and reasoning"
            )
        personas.append(
            PersonaSetting(
                persona=persona.persona,
                display_name=persona.display_name,
                strategy=persona.strategy,
                prompt=prompt,
                default_prompt=defaults[persona.persona],
            )
        )
    industry_rows = industries
    if industry_rows is None:
        industry_rows = [(item.name, item.icon) for item in DEFAULT_INDUSTRIES]
    return StudioSettings(
        max_position_pct=float(position),
        max_industry_pct=float(industry_cap),
        deep_value_weight=float(deep),
        trajectory_weight=float(trajectory),
        llm_model=model,
        use_transaction_history_analytics=use_transaction_history_analytics,
        min_cash_pct=float(min_cash_pct),
        daily_wish_checks=daily_wish_checks,
        daily_screenshot_imports=daily_screenshot_imports,
        daily_ai_reviews=daily_ai_reviews,
        industries=normalize_industries(industry_rows),
        personas=tuple(personas),
    )


def apply_settings(spec: FundSpec, settings: StudioSettings | None) -> FundSpec:
    if settings is None:
        return spec
    updated = spec.model_copy(deep=True)
    updated.risk.max_position_pct = settings.max_position_pct
    weights = {
        "deep-value": settings.deep_value_weight,
        "trajectory": settings.trajectory_weight,
    }
    for strategy in updated.strategies:
        if strategy.name in weights:
            strategy.weight = weights[strategy.name]
    return updated


def _with_prompt(agent_cls: type[LLMAgent], prompt: str) -> type[LLMAgent]:
    class Configured(agent_cls):
        def get_system_prompt(self) -> str:
            return prompt

    return Configured


def fund_with_settings(spec: FundSpec, settings: StudioSettings | None) -> Fund:
    prompts = {item.persona: item.prompt for item in settings.personas} if settings else {}
    model_id = settings.llm_model if settings else None
    staffed: dict[str, list] = {}
    for strategy in spec.strategies:
        analysts = []
        for model in strategy.models:
            agent_cls = ALPHA_MODEL_REGISTRY[model.name]
            kwargs = dict(model.params)
            if issubclass(agent_cls, LLMAgent):
                prompt = prompts.get(model.name)
                if prompt:
                    agent_cls = _with_prompt(agent_cls, prompt)
                if model_id:
                    kwargs["llm"] = make_llm(model_id)
            analysts.append(agent_cls(**kwargs))
        staffed[strategy.name] = analysts
    return Fund(spec, models=staffed)


def profiles_for_prompts(
    rows: list[dict[str, str]], defaults: dict[str, str]
) -> tuple[PersonaSetting, ...]:
    stored = {row["persona"]: row for row in rows}
    personas: list[PersonaSetting] = []
    for persona in PERSONAS:
        row = stored.get(persona.persona)
        prompt = (row or {}).get("prompt") or defaults[persona.persona]
        personas.append(
            PersonaSetting(
                persona=persona.persona,
                display_name=PERSONA_BY_NAME[persona.persona].display_name,
                strategy=PERSONA_BY_NAME[persona.persona].strategy,
                prompt=prompt,
                default_prompt=defaults[persona.persona],
            )
        )
    return tuple(personas)
