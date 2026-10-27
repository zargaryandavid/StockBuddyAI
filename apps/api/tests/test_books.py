import re
from pathlib import Path
from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy.books import BOOK_IDS
from stockbuddy.main import app

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
AUTH = {"Authorization": "Bearer user-token"}
WEB_BOOKS = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "books.ts"


class Gateway:
    async def authenticate(self, token: str) -> UUID:
        return USER_ID


class Db:
    def __init__(self):
        self.calls = []

    async def rest(self, method, table, *, token=None, params=None, json=None, prefer=None):
        self.calls.append(
            {"method": method, "table": table, "token": token, "params": params, "json": json}
        )
        if method == "GET" and table == "book_rating_summary":
            return [
                {"book_id": "psychology-of-money", "average": "4.50", "count": 2},
                {"book_id": "retired-book", "average": 5, "count": 9},
            ]
        if method == "GET" and table == "book_reviews" and token is None:
            return [
                {
                    "book_id": "psychology-of-money",
                    "stars": 5,
                    "comment": f"Great read {index}",
                    "updated_at": f"2026-10-2{index}T10:00:00+00:00",
                    "user_id": "should-not-leak",
                }
                for index in range(7, 0, -1)
            ]
        if method == "GET" and table == "book_reviews":
            return [{"book_id": "die-with-zero", "stars": 4, "comment": None}]
        if method == "POST":
            return [json]
        return None


class Repository:
    def __init__(self):
        self.db = Db()


def client_with(repository):
    client = TestClient(app)
    client.__enter__()
    app.state.gateway = Gateway()
    app.state.repository = repository
    return client


def test_api_book_ids_match_the_web_catalog():
    web_ids = set(re.findall(r'\bid: "([a-z0-9-]+)"', WEB_BOOKS.read_text()))
    assert web_ids == BOOK_IDS


def test_ratings_need_sign_in():
    client = client_with(Repository())
    try:
        assert client.get("/api/books/ratings").status_code == 401
    finally:
        client.__exit__(None, None, None)


def test_ratings_combine_everyone_with_the_persons_own_reviews():
    repository = Repository()
    client = client_with(repository)
    try:
        response = client.get("/api/books/ratings", headers=AUTH)
    finally:
        client.__exit__(None, None, None)
    assert response.status_code == 200
    body = response.json()
    assert body["ratings"] == {"psychology-of-money": {"average": 4.5, "count": 2}}
    assert body["mine"] == {"die-with-zero": {"stars": 4, "comment": None}}
    comments = body["comments"]["psychology-of-money"]
    assert len(comments) == 5
    assert comments[0] == {"stars": 5, "comment": "Great read 7", "date": "2026-10-27"}
    assert "should-not-leak" not in response.text
    by_table = {(call["table"], call["token"]) for call in repository.db.calls}
    # Aggregates and comments use the service role; "mine" is read as the person.
    assert ("book_rating_summary", None) in by_table
    assert ("book_reviews", None) in by_table
    assert ("book_reviews", "user-token") in by_table


def test_saves_a_review_as_the_person_with_an_upsert():
    repository = Repository()
    client = client_with(repository)
    try:
        response = client.put(
            "/api/books/psychology-of-money/review",
            headers=AUTH,
            json={"stars": 5, "comment": "  Changed how I think.  "},
        )
    finally:
        client.__exit__(None, None, None)
    assert response.status_code == 200
    assert response.json() == {
        "book_id": "psychology-of-money",
        "stars": 5,
        "comment": "Changed how I think.",
    }
    call = repository.db.calls[-1]
    assert call["method"] == "POST"
    assert call["token"] == "user-token"
    assert call["params"] == {"on_conflict": "user_id,book_id"}
    assert call["json"]["user_id"] == str(USER_ID)


def test_a_blank_comment_is_saved_as_none():
    repository = Repository()
    client = client_with(repository)
    try:
        response = client.put(
            "/api/books/die-with-zero/review", headers=AUTH, json={"stars": 3, "comment": "  "}
        )
    finally:
        client.__exit__(None, None, None)
    assert response.json()["comment"] is None


def test_refuses_bad_stars_long_comments_and_unknown_books():
    repository = Repository()
    client = client_with(repository)
    try:
        for stars in (0, 6):
            response = client.put(
                "/api/books/die-with-zero/review", headers=AUTH, json={"stars": stars}
            )
            assert response.status_code == 422
        response = client.put(
            "/api/books/die-with-zero/review",
            headers=AUTH,
            json={"stars": 4, "comment": "x" * 501},
        )
        assert response.status_code == 422
        response = client.put("/api/books/not-a-book/review", headers=AUTH, json={"stars": 4})
        assert response.status_code == 404
        response = client.put("/api/books/Bad_Id/review", headers=AUTH, json={"stars": 4})
        assert response.status_code == 422
    finally:
        client.__exit__(None, None, None)
    assert repository.db.calls == []


def test_deletes_only_the_persons_review():
    repository = Repository()
    client = client_with(repository)
    try:
        response = client.delete("/api/books/die-with-zero/review", headers=AUTH)
    finally:
        client.__exit__(None, None, None)
    assert response.status_code == 204
    call = repository.db.calls[-1]
    assert call["method"] == "DELETE"
    assert call["token"] == "user-token"
    assert call["params"] == {"user_id": f"eq.{USER_ID}", "book_id": "eq.die-with-zero"}
