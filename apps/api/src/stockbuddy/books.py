"""The Education Library: the admin-managed book list and readers' star ratings.

Books live in public.books (readable by every signed-in person, written only here with the
service role on behalf of the admin). Ratings live in public.book_reviews, one per person
per book; deleting a book deletes its ratings through the foreign key.
"""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from typing import Annotated, Any
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Request, Response
from pydantic import BaseModel, Field, field_validator

from stockbuddy.controls import AFFILIATE_TAG
from stockbuddy.supabase import Account, SupabaseError

router = APIRouter()

# Newest comments shown per book.
COMMENTS_PER_BOOK = 5
# Upper bound on comment rows read for the newest-per-book pick.
COMMENT_SCAN_LIMIT = 1000
BOOK_COLUMNS = "id,title,author,isbn,amazon_url,cover_url,description,topic,sort_order"
# Path words under /api/admin/books that can't be book ids.
RESERVED_IDS = frozenset({"order"})

SLUG = re.compile(r"^[a-z0-9-]{1,60}$")
ISBN = re.compile(r"^(\d{9}[\dX]|\d{13})$")
AMAZON_HOST = re.compile(r"^(www\.|smile\.)?amazon\.[a-z]{2,3}(\.[a-z]{2})?$")
# Covers are shown with <img>, so their hosts must also be allowed by the web app's
# Content-Security-Policy (apps/web/next.config.ts, img-src).
COVER_HOSTS = (
    "covers.openlibrary.org",
    "archive.org",
    ".archive.org",
    "m.media-amazon.com",
    "images-na.ssl-images-amazon.com",
    "images-eu.ssl-images-amazon.com",
    "books.google.com",
    "books.googleusercontent.com",
)

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


class BookInput(BaseModel):
    title: str = Field(default="", max_length=400)
    author: str = Field(default="", max_length=400)
    isbn: str | None = Field(default=None, max_length=40)
    amazon_url: str | None = Field(default=None, max_length=1000)
    cover_url: str | None = Field(default=None, max_length=1000)
    description: str = Field(default="", max_length=1200)
    topic: str = Field(default="", max_length=120)


class BookOrder(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)


class LibrarySettings(BaseModel):
    amazon_affiliate_tag: str = Field(default="", max_length=64)


def _token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    return authorization.removeprefix("Bearer ").strip()


async def _user(request: Request, token: Annotated[str, Depends(_token)]) -> UUID:
    try:
        return await request.app.state.gateway.authenticate(token)
    except SupabaseError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


async def _admin(request: Request, token: Annotated[str, Depends(_token)]) -> Account:
    """Same rule as main.require_admin (imported there would be a circular import)."""
    try:
        account = await request.app.state.gateway.identify(token)
    except SupabaseError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    if not request.app.state.gateway.is_admin(account):
        raise HTTPException(status_code=403, detail="Admin access required")
    return account


def _db(request: Request):
    return request.app.state.repository.db


def _optional(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def _https(url: str, message: str) -> tuple[str, str]:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or not host or parts.username or parts.password:
        raise ValueError(message)
    return url, host


def clean_book(payload: BookInput) -> dict[str, Any]:
    """The admin's book as stored, or ValueError with a message to show."""
    title = payload.title.strip()
    author = payload.author.strip()
    if not 1 <= len(title) <= 200:
        raise ValueError("Title is required (up to 200 characters)")
    if not 1 <= len(author) <= 200:
        raise ValueError("Author is required (up to 200 characters)")
    isbn = _optional(payload.isbn)
    if isbn:
        isbn = re.sub(r"[\s-]", "", isbn).upper()
        if not ISBN.fullmatch(isbn):
            raise ValueError("ISBN must be 10 or 13 digits (the last of 10 may be X)")
    amazon_url = _optional(payload.amazon_url)
    if amazon_url:
        message = "Amazon link must be an https link to an amazon.* site"
        if len(amazon_url) > 500:
            raise ValueError(message)
        _, host = _https(amazon_url, message)
        if not AMAZON_HOST.fullmatch(host):
            raise ValueError(message)
    cover_url = _optional(payload.cover_url)
    if cover_url:
        message = "Cover link must be an https link from Open Library, Amazon, or Google Books"
        if len(cover_url) > 500:
            raise ValueError(message)
        _, host = _https(cover_url, message)
        if not any(
            host.endswith(allowed) if allowed.startswith(".") else host == allowed
            for allowed in COVER_HOSTS
        ):
            raise ValueError(message)
    description = payload.description.strip()
    if len(description) > 600:
        raise ValueError("Description can be up to 600 characters")
    topic = payload.topic.strip()
    if len(topic) > 60:
        raise ValueError("Topic can be up to 60 characters")
    return {
        "title": title,
        "author": author,
        "isbn": isbn,
        "amazon_url": amazon_url,
        "cover_url": cover_url,
        "description": description,
        "topic": topic,
    }


def slug_for(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:50].strip("-")
    return slug or "book"


def _cleaned(payload: BookInput) -> dict[str, Any]:
    try:
        return clean_book(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def _book_exists(request: Request, book_id: str, token: str | None = None) -> bool:
    rows = await _db(request).rest(
        "GET", "books", token=token, params={"select": "id", "id": f"eq.{book_id}"}
    )
    return bool(rows)


async def _summary(request: Request) -> dict[str, dict[str, Any]]:
    rows = await _db(request).rest(
        "GET", "book_rating_summary", params={"select": "book_id,average,count"}
    )
    return {
        row["book_id"]: {"average": round(float(row["average"]), 2), "count": int(row["count"])}
        for row in rows or []
        if int(row["count"]) > 0
    }


async def _admin_list(request: Request) -> list[dict[str, Any]]:
    books, summary = await asyncio.gather(
        _db(request).rest(
            "GET", "books", params={"select": BOOK_COLUMNS, "order": "sort_order.asc,title.asc"}
        ),
        _summary(request),
    )
    return [_with_rating(book, summary) for book in books or []]


def _with_rating(book: dict[str, Any], summary: dict[str, dict[str, Any]]) -> dict[str, Any]:
    rating = summary.get(book["id"])
    return {
        **book,
        "average": rating["average"] if rating else None,
        "count": rating["count"] if rating else 0,
    }


# ── Everyone signed in ────────────────────────────────────────────────────────


@router.get("/api/books")
async def list_books(
    request: Request,
    token: Annotated[str, Depends(_token)],
    _user_id: Annotated[UUID, Depends(_user)],
) -> list[dict[str, Any]]:
    return await _db(request).rest(
        "GET",
        "books",
        token=token,
        params={"select": BOOK_COLUMNS, "order": "sort_order.asc,title.asc"},
    )


@router.get("/api/books/ratings")
async def book_ratings(
    request: Request,
    token: Annotated[str, Depends(_token)],
    _user_id: Annotated[UUID, Depends(_user)],
) -> dict[str, Any]:
    db = _db(request)
    # Everyone's averages and comments are read with the service role (row rules only let
    # a person see their own reviews); only stars, comment and date leave this function.
    ratings, comment_rows, mine_rows = await asyncio.gather(
        _summary(request),
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
    comments: dict[str, list[dict[str, Any]]] = {}
    for row in comment_rows or []:
        if not row.get("comment"):
            continue
        shown = comments.setdefault(row["book_id"], [])
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
    if not await _book_exists(request, book_id, token):
        raise HTTPException(status_code=404, detail="Book not found")
    rows = await _db(request).rest(
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
    await _db(request).rest(
        "DELETE",
        "book_reviews",
        token=token,
        params={"user_id": f"eq.{user_id}", "book_id": f"eq.{book_id}"},
        prefer="return=minimal",
    )
    return Response(status_code=204)


# ── Admin ─────────────────────────────────────────────────────────────────────


@router.get("/api/admin/books")
async def admin_books(
    request: Request, _account: Annotated[Account, Depends(_admin)]
) -> list[dict[str, Any]]:
    return await _admin_list(request)


@router.post("/api/admin/books", status_code=201)
async def create_book(
    payload: BookInput, request: Request, _account: Annotated[Account, Depends(_admin)]
) -> dict[str, Any]:
    book = _cleaned(payload)
    db = _db(request)
    base = slug_for(book["title"])
    taken_rows, last_rows = await asyncio.gather(
        db.rest("GET", "books", params={"select": "id", "id": f"like.{base}*"}),
        db.rest(
            "GET",
            "books",
            params={"select": "sort_order", "order": "sort_order.desc", "limit": "1"},
        ),
    )
    taken = {row["id"] for row in taken_rows or []} | RESERVED_IDS
    book_id = base
    suffix = 2
    while book_id in taken:
        book_id = f"{base}-{suffix}"
        suffix += 1
    sort_order = int(last_rows[0]["sort_order"]) + 1 if last_rows else 0
    rows = await db.rest(
        "POST",
        "books",
        json={**book, "id": book_id, "sort_order": sort_order},
        prefer="return=representation",
    )
    return _with_rating(_public(rows[0]), {})


@router.put("/api/admin/books/order")
async def reorder_books(
    payload: BookOrder, request: Request, _account: Annotated[Account, Depends(_admin)]
) -> list[dict[str, Any]]:
    db = _db(request)
    existing = {row["id"] for row in await db.rest("GET", "books", params={"select": "id"}) or []}
    if len(set(payload.ids)) != len(payload.ids) or set(payload.ids) != existing:
        raise HTTPException(status_code=422, detail="The order must list every book once")
    now = datetime.now(UTC).isoformat()
    await asyncio.gather(
        *(
            db.rest(
                "PATCH",
                "books",
                params={"id": f"eq.{book_id}"},
                json={"sort_order": index, "updated_at": now},
                prefer="return=minimal",
            )
            for index, book_id in enumerate(payload.ids)
        )
    )
    return await _admin_list(request)


@router.put("/api/admin/books/{book_id}")
async def update_book(
    book_id: BookId,
    payload: BookInput,
    request: Request,
    _account: Annotated[Account, Depends(_admin)],
) -> dict[str, Any]:
    book = _cleaned(payload)
    rows = await _db(request).rest(
        "PATCH",
        "books",
        params={"id": f"eq.{book_id}"},
        json={**book, "updated_at": datetime.now(UTC).isoformat()},
        prefer="return=representation",
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Book not found")
    return _with_rating(_public(rows[0]), await _summary(request))


@router.delete("/api/admin/books/{book_id}", status_code=204)
async def delete_book(
    book_id: BookId, request: Request, _account: Annotated[Account, Depends(_admin)]
) -> Response:
    rows = await _db(request).rest(
        "DELETE",
        "books",
        params={"id": f"eq.{book_id}"},
        prefer="return=representation",
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Book not found")
    return Response(status_code=204)


@router.put("/api/admin/library")
async def save_library_settings(
    payload: LibrarySettings, request: Request, _account: Annotated[Account, Depends(_admin)]
) -> dict[str, str]:
    tag = payload.amazon_affiliate_tag.strip()
    if not AFFILIATE_TAG.fullmatch(tag):
        raise HTTPException(
            status_code=422,
            detail="Amazon affiliate tag must be at most 64 letters, digits, or hyphens",
        )
    await _db(request).rest(
        "PATCH",
        "app_settings",
        params={"id": "eq.1"},
        json={"amazon_affiliate_tag": tag},
        prefer="return=minimal",
    )
    return {"amazon_affiliate_tag": tag}


def _public(row: dict[str, Any]) -> dict[str, Any]:
    return {key: row.get(key) for key in BOOK_COLUMNS.split(",")}
