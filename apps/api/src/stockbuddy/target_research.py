"""Approximate analyst price targets researched on the public web by OpenAI.

Financial Modeling Prep's free plan only covers the largest US companies. For any other
stock a client holds, OpenAI's web search tool looks up the Wall Street consensus 1-year
target in freely available sources (news articles, public analyst summaries) and says where
and when the figure comes from. Only ticker symbols are sent, never anything about a person.
Results are approximate and are labelled that way wherever they are shown.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
# One research request covers up to this many symbols; the rest wait for the next page load.
MAX_SYMBOLS_PER_REQUEST = 10

_PROMPT = (
    "You are a financial data researcher. For each stock ticker below, search the public web "
    "for the current Wall Street analyst consensus (average) 12-month price target, using "
    "freely available sources such as news articles and public analyst-rating summaries. "
    "Prefer the most recent figure and give it in US dollars per share of that ticker (for "
    "an ADR, per ADR). If the ticker is a fund or ETF, or analysts don't cover it, use null. "
    "Never guess or calculate a target yourself.\n\nTickers: {tickers}"
)

_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "targets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "target": {"type": ["number", "null"]},
                    "source": {"type": "string"},
                    "as_of": {"type": "string"},
                },
                "required": ["symbol", "target", "source", "as_of"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["targets"],
    "additionalProperties": False,
}


class ResearchFailed(RuntimeError):
    pass


def _output_text(payload: dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str):
        return direct
    for output in payload.get("output", []):
        for content in output.get("content", []) or []:
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    raise ResearchFailed("OpenAI returned no text")


def parse_research(text: str, asked: list[str]) -> dict[str, dict[str, Any] | None]:
    """The model's JSON as {symbol: {target, source, as_of} | None}, for the asked symbols only."""
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ResearchFailed("OpenAI returned no JSON")
    try:
        rows = json.loads(match.group(0))["targets"]
    except (KeyError, TypeError, ValueError) as exc:
        raise ResearchFailed("OpenAI returned unreadable JSON") from exc
    wanted = set(asked)
    found: dict[str, dict[str, Any] | None] = {symbol: None for symbol in asked}
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol", "")).strip().upper()
        if symbol not in wanted:
            continue
        try:
            target = float(row.get("target"))
        except (TypeError, ValueError):
            continue
        if not 0 < target < 1_000_000:
            continue
        found[symbol] = {
            "target": round(target, 4),
            "source": str(row.get("source") or "public web sources")[:120],
            "as_of": str(row.get("as_of") or "")[:40],
        }
    return found


class TargetResearch:
    def __init__(self, api_key: str, model: str, client: httpx.Client | None = None) -> None:
        self.api_key = api_key
        self.model = model
        self._client = client or httpx.Client(timeout=120)

    def research(self, symbols: list[str]) -> dict[str, dict[str, Any] | None]:
        asked = symbols[:MAX_SYMBOLS_PER_REQUEST]
        try:
            response = self._client.post(
                OPENAI_RESPONSES_URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "store": False,
                    "tools": [{"type": "web_search"}],
                    "input": _PROMPT.format(tickers=", ".join(asked)),
                    "text": {
                        "format": {
                            "type": "json_schema",
                            "name": "analyst_targets",
                            "strict": True,
                            "schema": _SCHEMA,
                        }
                    },
                },
            )
        except httpx.HTTPError as exc:
            raise ResearchFailed(
                f"OpenAI research request failed: {exc.__class__.__name__}"
            ) from exc
        if response.status_code >= 400:
            raise ResearchFailed(f"OpenAI research failed ({response.status_code})")
        return parse_research(_output_text(response.json()), asked)
