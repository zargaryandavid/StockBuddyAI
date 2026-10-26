from __future__ import annotations

from dataclasses import dataclass

from hedge_fund.signals import ALPHA_MODEL_REGISTRY, LLMAgent


@dataclass(frozen=True)
class PersonaProfile:
    persona: str
    display_name: str
    strategy: str


PERSONAS: tuple[PersonaProfile, ...] = (
    PersonaProfile("graham", "Benjamin Graham", "deep-value"),
    PersonaProfile("buffett", "Warren Buffett", "deep-value"),
    PersonaProfile("munger", "Charlie Munger", "deep-value"),
    PersonaProfile("lynch", "Peter Lynch", "trajectory"),
    PersonaProfile("druckenmiller", "Stanley Druckenmiller", "trajectory"),
)

PERSONA_BY_NAME = {persona.persona: persona for persona in PERSONAS}


class _UnusedLLM:
    model = "unused"

    def complete(self, system: str, user: str) -> str:
        raise RuntimeError("built-in prompts do not call the model")


def builtin_prompt(persona: str) -> str:
    profile = PERSONA_BY_NAME.get(persona)
    if profile is None:
        raise ValueError(f"unknown persona {persona}")
    agent_cls = ALPHA_MODEL_REGISTRY[persona]
    if not issubclass(agent_cls, LLMAgent):
        raise ValueError(f"{persona} is not an LLM persona")
    return agent_cls(llm=_UnusedLLM()).get_system_prompt().strip()


def builtin_prompts() -> dict[str, str]:
    return {persona.persona: builtin_prompt(persona.persona) for persona in PERSONAS}


def prompt_is_usable(prompt: str) -> bool:
    folded = prompt.lower()
    required = ("bullish", "bearish", "neutral", "reasoning")
    return all(word in folded for word in required)
