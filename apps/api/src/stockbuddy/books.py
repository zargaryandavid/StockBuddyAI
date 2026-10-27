"""The Education Library: readers' star ratings and short comments on recommended books.

The book list itself lives in the web app (apps/web/src/lib/books.ts); BOOK_IDS mirrors its
ids so only books the Library shows can be rated (tests/test_books.py keeps the two in step).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Request, Response
from pydantic import BaseModel, Field, field_validator

from stockbuddy.supabase import SupabaseError

router = APIRouter()

BOOK_IDS = frozenset(
    {
        "intelligent-investor",
        "little-book-common-sense-investing",
        "psychology-of-money",
        "simple-path-to-wealth",
        "random-walk-down-wall-street",
        "millionaire-next-door",
        "your-money-or-your-life",
        "i-will-teach-you-to-be-rich",
        "one-up-on-wall-street",
        "common-stocks-uncommon-profits",
        "bogleheads-guide-to-investing",
        "die-with-zero",
        "rich-dad-poor-dad",
        "richest-man-in-babylon",
        "security-analysis",
    }
)
# Newest comments shown per book.
COMMENTS_PER_BOOK = 5
# Upper bound on comment rows read for the newest-per-book pick.
COMMENT_SCAN_LIMIT = 1000

BookId = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,60}$")]


class ReviewInput(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)

    @field_validator("comment")
    @classmethod
    def blank_is_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


def _token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    return authorization.removeprefix("Bearer ").strip()


async def _user(request: Request, token: Annotated[str, Depends(_token)]) -> UUID:
    try:
        return await request.app.state.gateway.authenticate(token)
    except SupabaseError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def _known(book_id: str) -> str:
    if book_id not in BOOK_IDS:
        raise HTTPException(status_code=404, detail="Book not found")
    return book_id


@router.get("/api/books/ratings")
async def book_ratings(
    request: Request,
    token: Annotated[str, Depends(_token)],
    _user_id: Annotated[UUID, Depends(_user)],
) -> dict[str, Any]:
    db = request.app.state.repository.db
    # Everyone's averages and comments are read with the service role (row rules only let
    # a person see their own reviews); only stars, comment and date leave this function.
    summary, comment_rows, mine_rows = await asyncio.gather(
        db.rest("GET", "book_rating_summary", params={"select": "book_id,average,count"}),
        db.rest(
            "GET",
            "book_reviews",
            params={
                "select": "book_id,stars,comment,updated_at",
                "comment": "not.is.null",
                "order": "updated_at.desc",
                "limit": str(COMMENT_SCAN_LIMIT),
            },
        ),
        db.rest(
            "GET",
            "book_reviews",
            token=token,
            params={"select": "book_id,stars,comment"},
        ),
    )
    ratings = {
        row["book_id"]: {"average": round(float(row["average"]), 2), "count": int(row["count"])}
        for row in summary or []
        if row["book_id"] in BOOK_IDS and int(row["count"]) > 0
    }
    comments: dict[str, list[dict[str, Any]]] = {}
    for row in comment_rows or []:
        book = row["book_id"]
        if book not in BOOK_IDS or not row.get("comment"):
            continue
        shown = comments.setdefault(book, [])
        if len(shown) < COMMENTS_PER_BOOK:
            shown.append(
                {
                    "stars": int(row["stars"]),
                    "comment": row["comment"],
                    "date": str(row.get("updated_at") or "")[:10],
                }
            )
    mine = {
        row["book_id"]: {"stars": int(row["stars"]), "comment": row.get("comment")}
        for row in mine_rows or []
    }
    return {"ratings": ratings, "mine": mine, "comments": comments}


@router.put("/api/books/{book_id}/review")
async def save_book_review(
    book_id: BookId,
    review: ReviewInput,
    request: Request,
    token: Annotated[str, Depends(_token)],
    user_id: Annotated[UUID, Depends(_user)],
) -> dict[str, Any]:
    _known(book_id)
    rows = await request.app.state.repository.db.rest(
        "POST",
        "book_reviews",
        token=token,
        params={"on_conflict": "user_id,book_id"},
        json={
            "user_id": str(user_id),
            "book_id": book_id,
            "stars": review.stars,
            "comment": review.comment,
            "updated_at": datetime.now(UTC).isoformat(),
        },
        prefer="resolution=merge-duplicates,return=representation",
    )
    row = rows[0] if rows else {"stars": review.stars, "comment": review.comment}
    return {"book_id": book_id, "stars": int(row["stars"]), "comment": row.get("comment")}


@router.delete("/api/books/{book_id}/review", status_code=204)
async def delete_book_review(
    book_id: BookId,
    request: Request,
    token: Annotated[str, Depends(_token)],
    user_id: Annotated[UUID, Depends(_user)],
) -> Response:
    _known(book_id)
    await request.app.state.repository.db.rest(
        "DELETE",
        "book_reviews",
        token=token,
        params={"user_id": f"eq.{user_id}", "book_id": f"eq.{book_id}"},
        prefer="return=minimal",
    )
    return Response(status_code=204)
