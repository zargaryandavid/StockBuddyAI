from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from stockbuddy.books import BookInput, clean_book, slug_for
from stockbuddy.main import app
from stockbuddy.supabase import Account

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
USER = {"Authorization": "Bearer user-token"}
ADMIN = {"Authorization": "Bearer admin-token"}


class Gateway:
    async def authenticate(self, token: str) -> UUID:
        return USER_ID

    async def identify(self, token: str) -> Account:
        email = "admin@example.com" if token == "admin-token" else "user@example.com"
        return Account(id=USER_ID, email=email)

    def is_admin(self, account: Account) -> bool:
        return account.email == "admin@example.com"


def _eq(params, key):
    value = (params or {}).get(key, "")
    return value.removeprefix("eq.") if value.startswith("eq.") else None


class Db:
    """Just enough of PostgREST for the Library routes."""

    def __init__(self):
        self.calls = []
        self.books = {
            "psychology-of-money": {
                "id": "psychology-of-money",
                "title": "The Psychology of Money",
                "author": "Morgan Housel",
                "isbn": "0857197681",
                "amazon_url": None,
                "cover_url": None,
                "description": "",
                "topic": "Money mindset",
                "sort_order": 0,
            },
            "die-with-zero": {
                "id": "die-with-zero",
                "title": "Die With Zero",
                "author": "Bill Perkins",
                "isbn": "0358099765",
                "amazon_url": None,
                "cover_url": None,
                "description": "",
                "topic": "Money mindset",
                "sort_order": 1,
            },
        }
        self.settings_patch = None

    async def rest(self, method, table, *, token=None, params=None, json=None, prefer=None):
        self.calls.append(
            {"method": method, "table": table, "token": token, "params": params, "json": json}
        )
        if table == "book_rating_summary":
            return [
                {"book_id": "psychology-of-money", "average": "4.50", "count": 2},
                {"book_id": "die-with-zero", "average": None, "count": 0},
            ]
        if table == "book_reviews" and method == "GET" and token is None:
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
        if table == "book_reviews" and method == "GET":
            return [{"book_id": "die-with-zero", "stars": 4, "comment": None}]
        if table == "book_reviews" and method == "POST":
            return [json]
        if table == "app_settings":
            self.settings_patch = json
            return None
        if table == "books":
            book_id = _eq(params, "id")
            if method == "GET":
                like = (params or {}).get("id", "")
                rows = sorted(self.books.values(), key=lambda row: row["sort_order"])
                if book_id is not None:
                    rows = [row for row in rows if row["id"] == book_id]
                elif like.startswith("like."):
                    prefix = like.removeprefix("like.").rstrip("*")
                    rows = [row for row in rows if row["id"].startswith(prefix)]
                if (params or {}).get("order") == "sort_order.desc":
                    rows = rows[::-1][:1]
                return [dict(row) for row in rows]
            if method == "POST":
                self.books[json["id"]] = dict(json)
                return [dict(json)]
            if method == "PATCH":
                if book_id not in self.books:
                    return []
                self.books[book_id].update(json)
                return [dict(self.books[book_id])]
            if method == "DELETE":
                row = self.books.pop(book_id, None)
                return [row] if row else []
        return None


class Repository:
    def __init__(self):
        self.db = Db()


@pytest.fixture
def setup():
    repository = Repository()
    client = TestClient(app)
    client.__enter__()
    app.state.gateway = Gateway()
    app.state.repository = repository
    yield client, repository.db
    client.__exit__(None, None, None)


def test_signed_in_people_read_the_book_list_as_themselves(setup):
    client, db = setup
    assert client.get("/api/books").status_code == 401
    response = client.get("/api/books", headers=USER)
    assert response.status_code == 200
    assert [book["id"] for book in response.json()] == ["psychology-of-money", "die-with-zero"]
    assert db.calls[-1]["token"] == "user-token"
    assert db.calls[-1]["params"]["order"] == "sort_order.asc,title.asc"


def test_ratings_combine_everyone_with_the_persons_own_reviews(setup):
    client, db = setup
    assert client.get("/api/books/ratings").status_code == 401
    response = client.get("/api/books/ratings", headers=USER)
    assert response.status_code == 200
    body = response.json()
    assert body["ratings"] == {"psychology-of-money": {"average": 4.5, "count": 2}}
    assert body["mine"] == {"die-with-zero": {"stars": 4, "comment": None}}
    comments = body["comments"]["psychology-of-money"]
    assert len(comments) == 5
    assert comments[0] == {"stars": 5, "comment": "Great read 7", "date": "2026-10-27"}
    assert "should-not-leak" not in response.text
    used = {(call["table"], call["token"]) for call in db.calls}
    # Aggregates and comments use the service role; "mine" is read as the person.
    assert ("book_rating_summary", None) in used
    assert ("book_reviews", None) in used
    assert ("book_reviews", "user-token") in used


def test_saves_a_review_as_the_person_with_an_upsert(setup):
    client, db = setup
    response = client.put(
        "/api/books/psychology-of-money/review",
        headers=USER,
        json={"stars": 5, "comment": "  Changed how I think.  "},
    )
    assert response.status_code == 200
    assert response.json() == {
        "book_id": "psychology-of-money",
        "stars": 5,
        "comment": "Changed how I think.",
    }
    call = db.calls[-1]
    assert call["method"] == "POST"
    assert call["token"] == "user-token"
    assert call["params"] == {"on_conflict": "user_id,book_id"}
    assert call["json"]["user_id"] == str(USER_ID)
    blank = client.put(
        "/api/books/die-with-zero/review", headers=USER, json={"stars": 3, "comment": "  "}
    )
    assert blank.json()["comment"] is None


def test_refuses_bad_reviews_and_books_that_are_not_in_the_list(setup):
    client, db = setup
    for stars in (0, 6):
        response = client.put(
            "/api/books/die-with-zero/review", headers=USER, json={"stars": stars}
        )
        assert response.status_code == 422
    response = client.put(
        "/api/books/die-with-zero/review", headers=USER, json={"stars": 4, "comment": "x" * 501}
    )
    assert response.status_code == 422
    response = client.put("/api/books/Bad_Id/review", headers=USER, json={"stars": 4})
    assert response.status_code == 422
    response = client.put("/api/books/not-a-book/review", headers=USER, json={"stars": 4})
    assert response.status_code == 404
    assert response.json()["detail"] == "Book not found"
    assert not any(call["table"] == "book_reviews" for call in db.calls)


def test_deletes_only_the_persons_review(setup):
    client, db = setup
    response = client.delete("/api/books/die-with-zero/review", headers=USER)
    assert response.status_code == 204
    call = db.calls[-1]
    assert call["method"] == "DELETE"
    assert call["token"] == "user-token"
    assert call["params"] == {"user_id": f"eq.{USER_ID}", "book_id": "eq.die-with-zero"}


def test_admin_book_routes_need_the_admin(setup):
    client, db = setup
    book = {"title": "New", "author": "Someone"}
    for method, path, body in (
        ("GET", "/api/admin/books", None),
        ("POST", "/api/admin/books", book),
        ("PUT", "/api/admin/books/die-with-zero", book),
        ("DELETE", "/api/admin/books/die-with-zero", None),
        ("PUT", "/api/admin/books/order", {"ids": ["die-with-zero", "psychology-of-money"]}),
        ("PUT", "/api/admin/library", {"amazon_affiliate_tag": "x-20"}),
    ):
        assert client.request(method, path, json=body).status_code == 401
        assert client.request(method, path, json=body, headers=USER).status_code == 403
    assert db.calls == []


def test_admin_lists_books_with_their_ratings(setup):
    client, _db = setup
    response = client.get("/api/admin/books", headers=ADMIN)
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["id"] == "psychology-of-money"
    assert (rows[0]["average"], rows[0]["count"]) == (4.5, 2)
    assert (rows[1]["average"], rows[1]["count"]) == (None, 0)


def test_admin_adds_a_book_with_a_new_slug_at_the_end(setup):
    client, db = setup
    response = client.post(
        "/api/admin/books",
        headers=ADMIN,
        json={
            "title": "  Die With Zero ",
            "author": "Bill Perkins",
            "isbn": "978-0-358-09976-6",
            "amazon_url": "https://www.amazon.co.uk/dp/0358099765",
            "cover_url": "https://covers.openlibrary.org/b/isbn/0358099765-M.jpg",
            "topic": "Money mindset",
            "description": "Spend on experiences.",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "die-with-zero-2"  # the plain slug is taken
    assert body["title"] == "Die With Zero"
    assert body["isbn"] == "9780358099766"
    assert body["sort_order"] == 2
    assert (body["average"], body["count"]) == (None, 0)
    insert = next(call for call in db.calls if call["method"] == "POST")
    assert insert["token"] is None  # written with the service role


def test_admin_book_validation(setup):
    client, db = setup
    good = {"title": "A book", "author": "An author"}
    for change, message in (
        ({"title": " "}, "Title is required"),
        ({"author": "x" * 201}, "Author is required"),
        ({"isbn": "12345"}, "ISBN must be 10 or 13 digits"),
        ({"amazon_url": "http://www.amazon.com/dp/1"}, "Amazon link must be"),
        ({"amazon_url": "https://amazon.evil.com/dp/1"}, "Amazon link must be"),
        ({"amazon_url": "https://www.amazon.com.evil.io/dp/1"}, "Amazon link must be"),
        ({"cover_url": "http://covers.openlibrary.org/a.jpg"}, "Cover link must be"),
        ({"cover_url": "https://example.com/a.jpg"}, "Cover link must be"),
        ({"description": "x" * 601}, "Description can be up to 600"),
    ):
        response = client.post("/api/admin/books", headers=ADMIN, json={**good, **change})
        assert response.status_code == 422, change
        assert message in response.json()["detail"]
    assert not any(call["method"] == "POST" for call in db.calls)


def test_clean_book_accepts_the_allowed_hosts_and_isbn_shapes():
    book = clean_book(
        BookInput(
            title="T",
            author="A",
            isbn="0-393-35838-0",
            amazon_url="https://smile.amazon.de/dp/0393358380",
            cover_url="https://ia600505.us.archive.org/view.jpg",
        )
    )
    assert book["isbn"] == "0393358380"
    assert clean_book(BookInput(title="T", author="A", isbn="155860832x"))["isbn"] == "155860832X"
    assert clean_book(BookInput(title="T", author="A", amazon_url=" "))["amazon_url"] is None
    assert slug_for("The Bogleheads' Guide!") == "the-bogleheads-guide"
    assert slug_for("Գիրք") == "book"


def test_admin_edits_reorders_and_removes_books(setup):
    client, db = setup
    response = client.put(
        "/api/admin/books/die-with-zero",
        headers=ADMIN,
        json={"title": "Die With Zero", "author": "Bill Perkins", "topic": "Spending"},
    )
    assert response.status_code == 200
    assert response.json()["topic"] == "Spending"
    missing = client.put("/api/admin/books/nope", headers=ADMIN, json={"title": "x", "author": "y"})
    assert missing.status_code == 404

    bad = client.put("/api/admin/books/order", headers=ADMIN, json={"ids": ["die-with-zero"]})
    assert bad.status_code == 422
    response = client.put(
        "/api/admin/books/order",
        headers=ADMIN,
        json={"ids": ["die-with-zero", "psychology-of-money"]},
    )
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == ["die-with-zero", "psychology-of-money"]

    assert client.delete("/api/admin/books/die-with-zero", headers=ADMIN).status_code == 204
    assert "die-with-zero" not in db.books
    assert client.delete("/api/admin/books/die-with-zero", headers=ADMIN).status_code == 404


def test_admin_saves_the_affiliate_tag_from_the_library_section(setup):
    client, db = setup
    response = client.put(
        "/api/admin/library", headers=ADMIN, json={"amazon_affiliate_tag": " stockbuddy-20 "}
    )
    assert response.status_code == 200
    assert response.json() == {"amazon_affiliate_tag": "stockbuddy-20"}
    assert db.settings_patch == {"amazon_affiliate_tag": "stockbuddy-20"}
    bad = client.put("/api/admin/library", headers=ADMIN, json={"amazon_affiliate_tag": "a&b"})
    assert bad.status_code == 422
