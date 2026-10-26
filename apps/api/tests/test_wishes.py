import asyncio
import json
from types import SimpleNamespace
from uuid import UUID

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from stockbuddy.config import get_settings
from stockbuddy.main import app, current_user
from stockbuddy.schemas import WishCreate
from stockbuddy.supabase import SupabaseError
from stockbuddy.wishes import WISH_MODEL, WishMatcher, basic_matches, normalize

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
WISH_ID = UUID("70000000-0000-0000-0000-000000000001")
HEADERS = {"Authorization": "Bearer test-token"}
EXISTING = [
    {"id": "w1", "text": "Visit Japan"},
    {"id": "w2", "text": "Learn to play the guitar"},
    {"id": "w3", "text": "Run a marathon"},
]


class FakeMessages:
    def __init__(self, reply=None, error=None, stop_reason="end_turn"):
        self.reply = reply
        self.error = error
        self.stop_reason = stop_reason
        self.request = None

    async def create(self, **kwargs):
        self.request = kwargs
        if self.error:
            raise self.error
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type="text", text=json.dumps(self.reply))],
        )


def fake_client(messages):
    return SimpleNamespace(beta=SimpleNamespace(messages=messages))


def test_normalize_matches_the_database_rule_including_other_alphabets():
    assert normalize("  Visit   JAPAN! ") == "visit japan"
    assert normalize("Գնել_տուն") == "գնել տուն"


def test_exact_repeat_is_found_without_asking_claude():
    messages = FakeMessages(reply={"matches": []})
    result = asyncio.run(WishMatcher(fake_client(messages)).find("visit japan!", EXISTING))
    assert result.source == "exact"
    assert [match.id for match in result.matches] == ["w1"]
    assert messages.request is None


def test_claude_finds_repeats_worded_differently():
    messages = FakeMessages(
        reply={
            "matches": [
                {"number": 2, "reason": "Both are about playing guitar"},
                {"number": 9, "reason": "x"},
            ]
        }
    )
    result = asyncio.run(
        WishMatcher(fake_client(messages)).find("Become a guitar player", EXISTING)
    )
    assert result.source == "ai"
    assert [(match.id, match.reason) for match in result.matches] == [
        ("w2", "Both are about playing guitar")
    ]
    request = messages.request
    assert request["model"] == WISH_MODEL
    assert request["output_config"]["format"]["type"] == "json_schema"
    assert request["output_config"]["effort"] == "low"
    assert request["fallbacks"] == "default"
    assert "2. Learn to play the guitar" in request["messages"][0]["content"]
    assert "<new_wish>Become a guitar player</new_wish>" in request["messages"][0]["content"]


def test_falls_back_to_word_overlap_when_claude_fails_or_declines():
    error = anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.test"))
    failing = WishMatcher(fake_client(FakeMessages(error=error)))
    result = asyncio.run(failing.find("Visit Japan with family", EXISTING))
    assert result.source == "basic"
    declined = WishMatcher(fake_client(FakeMessages(reply={"matches": []}, stop_reason="refusal")))
    assert asyncio.run(declined.find("Run the marathon", EXISTING)).source == "basic"
    no_key = asyncio.run(WishMatcher(None).find("Run the Boston marathon", EXISTING))
    assert (no_key.source, [match.id for match in no_key.matches]) == ("basic", ["w3"])


def test_basic_matching_ignores_unrelated_wishes():
    assert basic_matches("Buy a house by the sea", EXISTING) == []


def test_wish_text_is_tidied_and_required():
    assert WishCreate(list="short", text="  Buy   a  bike ").text == "Buy a bike"
    with pytest.raises(ValidationError):
        WishCreate(list="short", text="   ")
    with pytest.raises(ValidationError):
        WishCreate(list="someday", text="Fly")


class Repository:
    def __init__(self, fail_with=None):
        self.fail_with = fail_with
        self.wishes = [
            {"id": str(WISH_ID), "list": "exercise", "text": "Visit Japan", "done": False}
        ]

    async def list_wishes(self, token, wish_list=None):
        assert token == "test-token"
        return [wish for wish in self.wishes if wish_list in (None, wish["list"])]

    async def create_wish(self, token, user_id, wish):
        if self.fail_with:
            raise SupabaseError(self.fail_with)
        return {"id": "new", **wish.model_dump()}

    async def update_wish(self, token, wish_id, wish):
        return (
            {"id": str(wish_id), **wish.model_dump(exclude_none=True)}
            if wish_id == WISH_ID
            else None
        )

    async def reorder_wishes(self, token, wish_list, ids):
        self.reordered = (wish_list, ids)
        return len(ids)

    async def delete_wish(self, token, wish_id):
        return wish_id == WISH_ID


def client_for(repository, matcher=None):
    app.dependency_overrides[current_user] = lambda: USER_ID
    client = TestClient(app)
    client.__enter__()
    app.state.repository = repository
    app.state.wish_matcher = matcher or WishMatcher(None)
    return client


def close(client):
    client.__exit__(None, None, None)
    app.dependency_overrides.clear()


def test_wish_endpoints_explain_repeats_and_a_full_exercise():
    duplicate = client_for(Repository('{"code":"23505","message":"duplicate key"}'))
    try:
        repeated = duplicate.post(
            "/api/wishes", headers=HEADERS, json={"list": "exercise", "text": "Visit Japan"}
        )
    finally:
        close(duplicate)
    assert (repeated.status_code, repeated.json()["detail"]) == (
        409,
        "This wish is already on the list",
    )

    full = client_for(Repository('{"code":"23514","message":"The 300 wishes exercise is full"}'))
    try:
        over = full.post(
            "/api/wishes", headers=HEADERS, json={"list": "exercise", "text": "One more"}
        )
    finally:
        close(full)
    assert (over.status_code, over.json()["detail"]) == (409, "The 300 wishes exercise is full")


def test_wish_endpoints_create_update_delete_and_check():
    client = client_for(Repository())
    try:
        created = client.post(
            "/api/wishes", headers=HEADERS, json={"list": "long", "text": "Buy a house"}
        )
        done = client.patch(f"/api/wishes/{WISH_ID}", headers=HEADERS, json={"done": True})
        missing = client.patch(f"/api/wishes/{USER_ID}", headers=HEADERS, json={"done": True})
        deleted = client.delete(f"/api/wishes/{WISH_ID}", headers=HEADERS)
        checked = client.post("/api/wishes/check", headers=HEADERS, json={"text": "visit JAPAN"})
        editing = client.post(
            "/api/wishes/check",
            headers=HEADERS,
            json={"text": "Visit Japan", "exclude_id": str(WISH_ID)},
        )
    finally:
        close(client)
    assert created.status_code == 201
    assert done.json()["done"] is True
    assert missing.status_code == 404
    assert deleted.status_code == 204
    assert checked.json() == {
        "source": "exact",
        "matches": [{"id": str(WISH_ID), "text": "Visit Japan", "reason": "Already on your list"}],
    }
    # A wish being edited is not compared with itself.
    assert editing.json()["matches"] == []


def test_browser_may_send_patch_to_tick_or_edit_a_wish():
    with TestClient(app) as client:
        origin = get_settings().web_origin
        preflight = client.options(
            f"/api/wishes/{WISH_ID}",
            headers={"Origin": origin, "Access-Control-Request-Method": "PATCH"},
        )
    assert preflight.status_code == 200
    assert "PATCH" in preflight.headers["access-control-allow-methods"]


def test_reorder_saves_one_list_in_the_dragged_order():
    repository = Repository()
    client = client_for(repository)
    try:
        saved = client.put(
            "/api/wishes/order",
            headers=HEADERS,
            json={"list": "short", "ids": [str(WISH_ID), str(USER_ID)]},
        )
        empty = client.put("/api/wishes/order", headers=HEADERS, json={"list": "short", "ids": []})
        bad = client.put(
            "/api/wishes/order", headers=HEADERS, json={"list": "x", "ids": [str(WISH_ID)]}
        )
    finally:
        close(client)
    assert saved.json() == {"moved": 2}
    assert repository.reordered == ("short", [WISH_ID, USER_ID])
    assert empty.status_code == 422
    assert bad.status_code == 422


def test_wish_check_falls_back_to_word_matching_once_todays_limit_is_used(monkeypatch):
    calls = []

    class LimitedRepository(Repository):
        async def load_settings(self):
            return type("Studio", (), {"daily_limit": lambda self, feature: 2})()

        async def use_ai_feature(self, token, feature, daily_limit):
            calls.append((feature, daily_limit))
            return False

    class Client:
        beta = None  # would fail if Claude were called

        async def close(self):
            pass

    client = client_for(LimitedRepository(), WishMatcher(Client()))
    try:
        result = client.post("/api/wishes/check", headers=HEADERS, json={"text": "Run a marathon"})
        exact = client.post("/api/wishes/check", headers=HEADERS, json={"text": "visit japan"})
    finally:
        close(client)
    assert result.json() == {"source": "limit", "matches": []}
    assert calls == [("wish_check", 2)]
    # Exact repeats are found without AI and don't count against the limit.
    assert exact.json()["source"] == "exact"
    assert calls == [("wish_check", 2)]
