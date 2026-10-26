from __future__ import annotations

import asyncio
import os
import time
from collections.abc import Callable
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import anthropic
import httpx
from hedge_fund.data.cached import CachedDataClient
from hedge_fund.features.snapshot import MIN_PERIODS as MIN_FILED_PERIODS
from hedge_fund.fund.spec import Fund, load_spec
from hedge_fund.llm.client import DEFAULT_MODEL
from hedge_fund.llm.registry import load_api_models, provider_for
from hedge_fund.pipeline.stages import assess_fund

from stockbuddy.advice import recommendation_for
from stockbuddy.config import Settings
from stockbuddy.controls import StudioSettings, apply_settings, fund_with_settings
from stockbuddy.providers import EdgarClient, EdgarError, PublicDataClient, YahooPriceClient
from stockbuddy.repository import Repository


class AnalysisService:
    def __init__(
        self,
        settings: Settings,
        repository: Repository,
        data_client: Any | None = None,
        mandate_path: Path | None = None,
        fund_factory: Callable[[Any], Fund] = Fund,
        load_settings: Callable[[], Any] | None = None,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self._data_client = data_client
        self._fund_factory = fund_factory
        self._load_settings = load_settings
        self._ready: tuple[float, str | None] | None = None
        self._blockers: dict[tuple[str, str], str | None] = {}
        self.mandate_path = mandate_path or (
            Path(__file__).resolve().parents[2] / "mandates" / "long-book.yaml"
        )

    def data_client(self):
        if self._data_client is None:
            self.settings.validate_runtime()
            raw = PublicDataClient(
                EdgarClient(
                    self.settings.sec_user_agent,
                    cache_dir=self.settings.sec_cache_dir,
                ),
                YahooPriceClient(),
            )
            self._data_client = CachedDataClient(
                raw,
                cache_dir=Path(self.settings.sec_cache_dir).parent / "engine",
                live=True,
            )
        return self._data_client

    async def ready(self) -> str | None:
        """Why reviews can't run right now (a missing or rejected AI key), or None.

        Checked before a review is counted against the daily limit, so a broken key
        doesn't use anyone's tokens. A working key is re-checked every 10 minutes.
        """
        now = time.monotonic()
        if self._ready and now - self._ready[0] < (600 if self._ready[1] is None else 30):
            return self._ready[1]
        studio = await self._load_settings() if self._load_settings else None
        model = (
            getattr(studio, "llm_model", None)
            or os.environ.get("HEDGE_FUND_LLM_MODEL")
            or DEFAULT_MODEL
        )
        provider = provider_for(model) or "Anthropic"
        problem = await _key_problem(provider, self.settings)
        reason = None
        if problem:
            other = "OpenAI" if provider == "Anthropic" else "Anthropic"
            reason = (
                f"The review model in Admin → Studio is {model}, which uses {provider}: "
                f"{problem} Fix the {provider} key in Admin → Connections, or pick "
                f"an {other} model in Admin → Studio."
            )
        self._ready = (now, reason)
        return reason

    async def review_blockers(self, tickers: list[str], as_of: str) -> dict[str, str | None]:
        """Why each ticker can't get a review on this close, or None when it can.

        Uses the same filed financials the personas read, so a holding with too few
        is caught before it costs a token. Checking problems never block a review.
        """
        results: dict[str, str | None] = {}
        for ticker in tickers:
            key = (ticker.upper(), as_of)
            if key not in self._blockers:
                self._blockers[key] = await asyncio.to_thread(self._blocker, key[0], as_of)
            results[ticker] = self._blockers[key]
        return results

    def _blocker(self, ticker: str, as_of: str) -> str | None:
        try:
            metrics = self.data_client().get_financial_metrics(
                ticker, as_of, period="ttm", limit=MIN_FILED_PERIODS
            )
        except EdgarError:
            return (
                "Its SEC filings have no company financials to review. "
                "This is common for funds and trusts."
            )
        except Exception:  # an outage or a parsing gap shouldn't block the review
            return None
        if not metrics:
            if self._files_with_sec(ticker):
                return (
                    "No quarterly financials are filed yet (a recent listing). It can be "
                    f"reviewed once {MIN_FILED_PERIODS} quarters are filed."
                )
            return (
                "The SEC has no company financials for it: it may be an ETF or fund, a "
                "foreign listing, or too new."
            )
        if len(metrics) < MIN_FILED_PERIODS:
            return (
                f"Only {len(metrics)} of {MIN_FILED_PERIODS} quarters of financials are filed "
                "so far (a recent listing). It can be reviewed once "
                f"{MIN_FILED_PERIODS} are filed."
            )
        return None

    def _files_with_sec(self, ticker: str) -> bool:
        client = self.data_client()
        edgar = getattr(getattr(client, "_client", client), "edgar", None)
        try:
            return edgar is not None and edgar._cik(ticker) is not None
        except Exception:
            return False

    def forget_key_check(self) -> None:
        self._ready = None

    async def run(
        self, run_id: UUID, user_id: UUID, portfolio: dict[str, Any], ticker: str, as_of: str
    ) -> None:
        await self.repository.set_run_status(run_id, "running")
        try:
            studio = await self._load_settings() if self._load_settings else None
            decision, signals, recommendation = await asyncio.to_thread(
                self._analyze, portfolio, ticker, as_of, studio
            )
            unanswered = _ai_unreachable(signals)
            if unanswered:
                self._ready = None  # look at the key again before the next review
                raise ValueError(unanswered)
            signal_rows = [{**signal, "run_id": str(run_id)} for signal in signals]
            recommendation_row = {**recommendation, "run_id": str(run_id)}
            await self.repository.save_report(run_id, decision, signal_rows, recommendation_row)
        except Exception as exc:
            await self.repository.set_run_status(run_id, "failed", error=str(exc))

    def _analyze(
        self,
        portfolio: dict[str, Any],
        ticker: str,
        as_of: str,
        studio: StudioSettings | None = None,
    ) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
        client = self.data_client()
        spec = apply_settings(load_spec(self.mandate_path), studio)
        if self._fund_factory is Fund:
            fund = fund_with_settings(spec, studio)
        else:
            fund = self._fund_factory(spec)
        decision = assess_fund(fund, as_of, client, [ticker])
        if ticker not in decision.marks:
            raise ValueError(f"{ticker} has no valid closing price near {as_of}")

        positions = {
            row["ticker"].upper(): int(row["shares"])
            for row in portfolio.get("portfolio_positions", [])
        }
        marks: dict[str, float] = {}
        start = (date.fromisoformat(as_of) - timedelta(days=7)).isoformat()
        for held_ticker, shares in positions.items():
            if shares == 0:
                continue
            bars = client.get_prices(held_ticker, start, as_of)
            eligible = [bar for bar in bars if bar.time[:10] <= as_of]
            if not eligible:
                raise ValueError(f"Cannot value held ticker {held_ticker}: no close near {as_of}")
            marks[held_ticker] = max(eligible, key=lambda bar: bar.time).close

        cash = float(portfolio["cash"])
        equity = cash + sum(
            shares * marks[held_ticker] for held_ticker, shares in positions.items() if shares
        )
        mark = decision.marks[ticker]
        recommendation = recommendation_for(
            ticker=ticker,
            shares=positions.get(ticker, 0),
            mark=mark,
            equity=equity,
            target_weight=decision.final_weights.get(ticker, 0.0),
        )

        signals: list[dict[str, Any]] = []
        for strategy in decision.strategies:
            for signal in strategy.signals:
                metadata = signal.metadata
                signals.append(
                    {
                        "strategy": strategy.name,
                        "persona": signal.model_name,
                        "ticker": signal.ticker,
                        "signal": metadata.get("signal", "neutral"),
                        "confidence": float(metadata.get("confidence", 0)),
                        "value": signal.value,
                        "reasoning": signal.reasoning or "",
                        "abstained": bool(metadata.get("abstained", False)),
                    }
                )
        return decision.model_dump(mode="json"), signals, recommendation


def _ai_unreachable(signals: list[dict[str, Any]]) -> str | None:
    """A readable reason when no persona could reach the AI model, else None."""
    if not signals or not all(signal["abstained"] for signal in signals):
        return None
    reasons = " ".join(signal["reasoning"] for signal in signals)
    if "LLM call failed" not in reasons:
        return None
    if any(
        marker in reasons
        for marker in (
            "insufficient_quota",
            "credit_balance_exhausted",
            "credit balance is too low",
        )
    ):
        provider = (
            "OpenAI"
            if "openai.com" in reasons or "insufficient_quota" in reasons
            else ("Anthropic")
        )
        return (
            f"The AI service account ({provider}) has run out of credits, so no persona could "
            f"answer. An admin needs to add credits in the {provider} billing settings."
        )
    if "authentication_error" in reasons or "invalid x-api-key" in reasons or "401" in reasons:
        return (
            "The AI service rejected its API key, so no persona could answer. "
            "An admin can fix this in Admin → Connections."
        )
    return "No persona could reach the AI service. Try again in a few minutes."


async def _key_problem(provider: str, settings: Settings) -> str | None:
    """Checks the persona model's API key without running a model. None when it works.

    Network trouble is not treated as a key problem, so a brief outage never blocks
    reviews here; the review itself reports it.
    """
    try:
        if provider == "Anthropic":
            if not settings.anthropic_api_key:
                return "No Anthropic API key is set."
            async with anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key) as client:
                await client.models.list(limit=1)
        elif provider == "OpenAI":
            if not settings.openai_api_key:
                return "No OpenAI API key is set."
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                )
            if response.status_code in (401, 403):
                return "OpenAI rejected the API key."
    except anthropic.AuthenticationError:
        return "Anthropic rejected the API key."
    except anthropic.PermissionDeniedError:
        return "The Anthropic API key isn't allowed to use the model."
    except (anthropic.APIError, httpx.HTTPError):
        return None
    return None


# Providers whose keys can be set in Admin -> Connections.
REVIEW_PROVIDERS = ("Anthropic", "OpenAI")


def review_models() -> list[dict[str, str]]:
    """Models the persona review can use, with the provider whose key each one needs."""
    return [
        {"id": model_id, "name": name, "provider": provider}
        for name, model_id, provider in load_api_models()
        if provider in REVIEW_PROVIDERS
    ]
