"""Future allocation: a budget and the investments a person is considering for it."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator

from stockbuddy.net_worth import _token, _user

router = APIRouter()

_TICKER = re.compile(r"^[A-Z0-9.\-^=]{1,15}$")


class AllocationItem(BaseModel):
    label: str = Field(default="", max_length=60)
    # Empty for something without a market symbol, such as a local bond or a deposit.
    ticker: str = Field(default="", max_length=15)
    name: str = Field(default="", max_length=80)
    mode: Literal["pct", "amount"] = "pct"
    value: float = Field(default=0, ge=0, le=1e15)
    # Used when there is no symbol to look up, e.g. a bond's coupon.
    expected_return_pct: float | None = Field(default=None, ge=-100, le=1000)

    @field_validator("label", "name")
    @classmethod
    def tidy(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("ticker")
    @classmethod
    def symbol(cls, value: str) -> str:
        ticker = value.strip().upper()
        if ticker and not _TICKER.match(ticker):
            raise ValueError("Use a market symbol such as VOO, or leave it empty")
        return ticker

    @field_validator("mode", mode="before")
    @classmethod
    def mode_default(cls, value: Any) -> Any:
        return value or "pct"


class AllocationPlan(BaseModel):
    budget: float = Field(default=0, ge=0, le=1e15)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    items: list[AllocationItem] = Field(default_factory=list, max_length=40)

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, value: str) -> str:
        currency = value.strip().upper()
        if not currency.isalpha():
            raise ValueError("currency must be a three-letter code")
        return currency


@router.get("/api/allocation-plan")
async def get_allocation_plan(
    request: Request,
    token: Annotated[str, Depends(_token)],
    _user_id: Annotated[UUID, Depends(_user)],
) -> dict[str, Any]:
    rows = await request.app.state.repository.db.rest(
        "GET",
        "allocation_plans",
        token=token,
        params={"select": "budget,currency,items,updated_at", "limit": "1"},
    )
    return rows[0] if rows else {"budget": 0, "currency": "USD", "items": [], "updated_at": None}


@router.put("/api/allocation-plan")
async def save_allocation_plan(
    plan: AllocationPlan,
    request: Request,
    token: Annotated[str, Depends(_token)],
    user_id: Annotated[UUID, Depends(_user)],
) -> dict[str, Any]:
    rows = await request.app.state.repository.db.rest(
        "POST",
        "allocation_plans",
        token=token,
        params={"on_conflict": "user_id"},
        json={
            "user_id": str(user_id),
            "budget": round(plan.budget, 2),
            "currency": plan.currency,
            "items": [item.model_dump() for item in plan.items],
            "updated_at": datetime.now(UTC).isoformat(),
        },
        prefer="resolution=merge-duplicates,return=representation",
    )
    return rows[0]
