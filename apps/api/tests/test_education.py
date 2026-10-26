from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from stockbuddy.main import app
from stockbuddy.schemas import EducationArticleInput
from stockbuddy.supabase import Account

ADMIN = Account(id=UUID("00000000-0000-0000-0000-000000000099"), email="admin@example.com")
USER = Account(id=UUID("00000000-0000-0000-0000-000000000001"), email="owner@example.com")
ARTICLE_ID = UUID("60000000-0000-0000-0000-000000000001")
MISSING_ID = UUID("60000000-0000-0000-0000-000000000002")


class Gateway:
    def __init__(self):
        self.uploaded = []
        self.deleted = []

    async def identify(self, token):
        return ADMIN if token == "admin" else USER

    async def authenticate(self, token):
        return (await self.identify(token)).id

    def is_admin(self, account):
        return account.email == ADMIN.email

    async def upload_object(self, bucket, path, content, content_type):
        self.uploaded.append((bucket, path, content, content_type))

    async def delete_object(self, bucket, path):
        self.deleted.append((bucket, path))

    def public_object_url(self, bucket, path):
        return f"https://storage.test/{bucket}/{path}"


class Repository:
    def __init__(self):
        self.article = {
            "id": str(ARTICLE_ID),
            "title": "Why index funds",
            "body": "Low cost.",
            "image_path": "articles/old.png",
            "published": True,
            "position": 0,
        }
        self.saved = None

    async def list_published_articles(self, token):
        self.read_with = token
        return [self.article]

    async def list_all_articles(self):
        draft = {**self.article, "id": "draft", "published": False, "image_path": None}
        return [self.article, draft]

    async def get_article(self, article_id):
        return self.article if article_id == ARTICLE_ID else None

    async def create_article(self, article):
        self.saved = article
        return {"id": "new", **article.model_dump()}

    async def update_article(self, article_id, article):
        self.saved = article
        return {"id": str(article_id), **article.model_dump()}

    async def delete_article(self, article_id):
        return self.article if article_id == ARTICLE_ID else None


@pytest.fixture
def setup():
    with TestClient(app) as client:
        gateway, repository = Gateway(), Repository()
        app.state.gateway = gateway
        app.state.repository = repository
        yield client, gateway, repository


def auth(token):
    return {"Authorization": f"Bearer {token}"}


ARTICLE = {
    "title": " Compounding ",
    "body": "Returns earn returns.",
    "image_path": "articles/a1.png",
}


def test_every_user_reads_published_articles_with_picture_urls(setup):
    client, _, repository = setup
    response = client.get("/api/education/articles", headers=auth("user-token"))
    assert response.status_code == 200
    assert repository.read_with == "user-token"
    assert response.json()[0]["image_url"] == "https://storage.test/education/articles/old.png"


def test_only_admins_can_manage_articles(setup):
    client, gateway, _ = setup
    for method, path in [
        ("GET", "/api/admin/education/articles"),
        ("POST", "/api/admin/education/articles"),
        ("PUT", f"/api/admin/education/articles/{ARTICLE_ID}"),
        ("DELETE", f"/api/admin/education/articles/{ARTICLE_ID}"),
    ]:
        response = client.request(method, path, headers=auth("user"), json=ARTICLE)
        assert response.status_code == 403, path
    upload = client.post(
        "/api/admin/education/images",
        headers=auth("user"),
        files={"image": ("a.png", b"png", "image/png")},
    )
    assert upload.status_code == 403
    assert gateway.uploaded == []


def test_admin_creates_updates_and_deletes_articles_and_cleans_up_pictures(setup):
    client, gateway, repository = setup
    listed = client.get("/api/admin/education/articles", headers=auth("admin"))
    assert [row["published"] for row in listed.json()] == [True, False]
    assert listed.json()[1]["image_url"] is None

    created = client.post("/api/admin/education/articles", headers=auth("admin"), json=ARTICLE)
    assert created.status_code == 201
    assert repository.saved.title == "Compounding"
    assert created.json()["image_url"].endswith("articles/a1.png")

    updated = client.put(
        f"/api/admin/education/articles/{ARTICLE_ID}", headers=auth("admin"), json=ARTICLE
    )
    assert updated.status_code == 200
    # The replaced picture is removed from storage.
    assert gateway.deleted == [("education", "articles/old.png")]

    missing = client.put(
        f"/api/admin/education/articles/{MISSING_ID}", headers=auth("admin"), json=ARTICLE
    )
    assert missing.status_code == 404

    deleted = client.delete(f"/api/admin/education/articles/{ARTICLE_ID}", headers=auth("admin"))
    assert deleted.status_code == 204
    assert gateway.deleted[-1] == ("education", "articles/old.png")
    not_found = client.delete(f"/api/admin/education/articles/{MISSING_ID}", headers=auth("admin"))
    assert not_found.status_code == 404


def test_picture_upload_checks_type_and_size(setup):
    client, gateway, _ = setup
    ok = client.post(
        "/api/admin/education/images",
        headers=auth("admin"),
        files={"image": ("photo.jpg", b"jpeg-bytes", "image/jpeg")},
    )
    assert ok.status_code == 201
    bucket, path, content, content_type = gateway.uploaded[0]
    assert (bucket, content, content_type) == ("education", b"jpeg-bytes", "image/jpeg")
    assert path.startswith("articles/") and path.endswith(".jpg")
    assert ok.json() == {"image_path": path, "image_url": f"https://storage.test/education/{path}"}

    wrong = client.post(
        "/api/admin/education/images",
        headers=auth("admin"),
        files={"image": ("doc.pdf", b"%PDF", "application/pdf")},
    )
    assert wrong.status_code == 422
    too_big = client.post(
        "/api/admin/education/images",
        headers=auth("admin"),
        files={"image": ("big.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")},
    )
    assert too_big.status_code == 413


def test_article_paths_cannot_leave_the_articles_folder():
    with pytest.raises(ValidationError):
        EducationArticleInput(title="T", body="B", image_path="../secret.png")
    with pytest.raises(ValidationError):
        EducationArticleInput(title="  ", body="B")
