"""Net worth over time: one reading per person per day, saved when they open the app."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from stockbuddy.supabase import SupabaseError

router = APIRouter()

# Long enough for the chart's longest range.
HISTORY_DAYS = 365 * 5


class NetWorthReading(BaseModel):
    day: date
    investments: float = Field(ge=-1e15, le=1e15)
    savings: float = Field(ge=-1e15, le=1e15)
    other_assets: float = Field(ge=-1e15, le=1e15)
    currency: str = Field(default="USD", min_length=3, max_length=3)


def _token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    return authorization.removeprefix("Bearer ").strip()


async def _user(request: Request, token: Annotated[str, Depends(_token)]) -> UUID:
    try:
        return await request.app.state.gateway.authenticate(token)
    except SupabaseError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/api/net-worth")
async def net_worth_history(
    request: Request,
    token: Annotated[str, Depends(_token)],
    _user_id: Annotated[UUID, Depends(_user)],
) -> list[dict[str, Any]]:
    since = (date.today() - timedelta(days=HISTORY_DAYS)).isoformat()
    return await request.app.state.repository.db.rest(
        "GET",
        "net_worth_snapshots",
        token=token,
        params={
            "select": "day,investments,savings,other_assets,total,currency",
            "day": f"gte.{since}",
            "order": "day.asc",
        },
    )


@router.put("/api/net-worth/today")
async def save_net_worth(
    reading: NetWorthReading,
    request: Request,
    token: Annotated[str, Depends(_token)],
    user_id: Annotated[UUID, Depends(_user)],
) -> dict[str, Any]:
    # The browser sends its own date; refuse anything far from the server's.
    if abs((reading.day - date.today()).days) > 1:
        raise HTTPException(status_code=422, detail="A reading can only be saved for today")
    total = reading.investments + reading.savings + reading.other_assets
    rows = await request.app.state.repository.db.rest(
        "POST",
        "net_worth_snapshots",
        token=token,
        params={"on_conflict": "user_id,day"},
        json={
            "user_id": str(user_id),
            "day": reading.day.isoformat(),
            "investments": round(reading.investments, 2),
            "savings": round(reading.savings, 2),
            "other_assets": round(reading.other_assets, 2),
            "total": round(total, 2),
            "currency": reading.currency.upper(),
            "updated_at": datetime.now(UTC).isoformat(),
        },
        prefer="resolution=merge-duplicates,return=representation",
    )
    return rows[0]
