import asyncio
import base64
import os
import smtplib
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient

from stockbuddy import connections as module
from stockbuddy.config import Settings
from stockbuddy.connections import ConnectionSetupError, ConnectionsService
from stockbuddy.main import app
from stockbuddy.supabase import Account

ADMIN = Account(id=UUID("00000000-0000-0000-0000-000000000099"), email="admin@example.com")
USER = Account(id=UUID("00000000-0000-0000-0000-000000000001"), email="owner@example.com")


class FakeDb:
    """Stores app_connections rows the way PostgREST would."""

    def __init__(self):
        self.rows: dict[tuple[str, str], str] = {}

    async def rest(self, method, path, **kwargs):
        assert path == "app_connections"
        assert "token" not in kwargs  # always the service role
        if method == "GET":
            return [
                {"connection": c, "field": f, "value_encrypted": v}
                for (c, f), v in self.rows.items()
            ]
        if method == "POST":
            row = kwargs["json"]
            self.rows[(row["connection"], row["field"])] = row["value_encrypted"]
            return None
        if method == "DELETE":
            params = kwargs["params"]
            self.rows.pop((params["connection"][3:], params["field"][3:]), None)
            return None
        raise AssertionError(method)


def base_settings(**overrides):
    values = {
        "supabase_service_role_key": "service-role-secret",
        "anthropic_api_key": "sk-ant-from-env-1234",
        "sec_user_agent": "MyPortfolioBuddy env@example.com",
        "smtp_host": "",
        "smtp_from": "",
    }
    return Settings(**{**values, **overrides})


def test_admin_values_are_encrypted_win_over_env_and_can_be_cleared():
    db = FakeDb()
    service = ConnectionsService(base_settings(), db)
    asyncio.run(service.save("anthropic", {"api_key": "  sk-ant-admin-abcd  "}))

    stored = db.rows[("anthropic", "api_key")]
    assert "sk-ant-admin" not in stored  # encrypted at rest
    assert service.effective().anthropic_api_key == "sk-ant-admin-abcd"

    # A fresh service (e.g. after a restart) reads the same value back.
    reloaded = ConnectionsService(base_settings(), db)
    asyncio.run(reloaded.load())
    assert reloaded.effective().anthropic_api_key == "sk-ant-admin-abcd"

    asyncio.run(service.save("anthropic", {"api_key": None}))
    assert service.effective().anthropic_api_key == "sk-ant-from-env-1234"


def test_description_never_contains_secrets_and_names_the_source():
    db = FakeDb()
    service = ConnectionsService(base_settings(), db)
    asyncio.run(
        service.save("email", {"host": "smtp.test", "password": "hunter2-pass", "port": "2525"})
    )
    described = {item["id"]: item for item in service.describe()}

    assert "hunter2" not in str(described)
    assert "sk-ant-from-env" not in str(described)
    anthropic_key = described["anthropic"]["fields"][0]
    assert (anthropic_key["source"], anthropic_key["hint"]) == ("env", "•••• 1234")
    email = {field["key"]: field for field in described["email"]["fields"]}
    assert (email["host"]["value"], email["host"]["source"]) == ("smtp.test", "admin")
    assert email["port"]["value"] == 2525
    assert email["password"]["hint"] == "•••• pass"
    assert email["username"]["source"] == "unset"
    assert described["email"]["configured"] is False  # no Send from address yet
    assert described["market"]["configurable"] is False


def test_values_are_checked_before_saving():
    service = ConnectionsService(base_settings(), FakeDb())
    for connection, values, message in [
        ("email", {"port": "99999"}, "Port must be"),
        ("email", {"from_address": "no-email"}, "email address"),
        ("sec", {"user_agent": "MyPortfolioBuddy"}, "email address"),
        ("email", {"starttls": "yes"}, "on or off"),
        ("anthropic", {"api_key": "   "}, "can't be empty"),
        ("anthropic", {"model": "x"}, "Unknown field"),
    ]:
        with pytest.raises(ConnectionSetupError, match=message):
            asyncio.run(service.save(connection, values))
    with pytest.raises(KeyError):
        asyncio.run(service.save("market", {"x": "y"}))


def test_a_value_that_cannot_be_decrypted_is_ignored():
    db = FakeDb()
    db.rows[("anthropic", "api_key")] = "not-a-valid-token"
    service = ConnectionsService(base_settings(), db)
    asyncio.run(service.load())
    assert service.effective().anthropic_api_key == "sk-ant-from-env-1234"
    field = service.describe()[0]["fields"][0]
    assert field["unreadable"] is True


def test_live_checks_report_readable_results_without_secrets(monkeypatch):
    service = ConnectionsService(base_settings(smtp_host="smtp.test", smtp_from="a@b.c"), FakeDb())

    def refuse(settings):
        raise smtplib.SMTPAuthenticationError(535, b"bad credentials")

    monkeypatch.setattr(module, "_smtp_login", refuse)
    result = asyncio.run(service.test("email", {}))
    assert result["ok"] is False
    assert result["message"] == "The email server rejected the username or password."
    assert service.describe()[2]["last_test"] == result

    def unreachable(settings):
        raise ConnectionRefusedError(61, "Connection refused")

    monkeypatch.setattr(module, "_smtp_login", unreachable)
    assert asyncio.run(service.test("email", {}))["message"].startswith("Nothing answered")

    monkeypatch.setattr(module, "_smtp_login", lambda settings: None)
    assert asyncio.run(service.test("email", {}))["ok"] is True

    class Market:
        def close_history(self, tickers, start):
            return {"SPY": [{"date": "2026-10-23", "close": 512.3}]}

    market = asyncio.run(service.test("market", {"market": Market()}))
    assert market == {
        **market,
        "ok": True,
        "message": "Prices load. SPY closed at 512.30 on 2026-10-23.",
    }

    no_key = ConnectionsService(base_settings(anthropic_api_key=""), FakeDb())
    assert asyncio.run(no_key.test("anthropic", {}))["message"] == "No API key is set."


class Gateway:
    async def identify(self, token):
        return ADMIN if token == "admin" else USER

    def is_admin(self, account):
        return account.email == ADMIN.email


class StudioRepository:
    async def load_settings(self):
        return type("Studio", (), {"llm_model": "claude-opus-5-5"})()


def test_only_admins_reach_connections_and_saving_applies_at_once(monkeypatch):
    # Saving sets provider keys in the environment; put them back after the test.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with TestClient(app) as client:
        app.state.gateway = Gateway()
        app.state.repository = StudioRepository()
        app.state.connections = ConnectionsService(base_settings(), FakeDb())
        user = {"Authorization": "Bearer user"}
        admin = {"Authorization": "Bearer admin"}

        assert client.get("/api/admin/connections", headers=user).status_code == 403
        assert (
            client.put(
                "/api/admin/connections/anthropic", headers=user, json={"values": {"api_key": "x"}}
            ).status_code
            == 403
        )
        assert client.post("/api/admin/connections/anthropic/test", headers=user).status_code == 403

        listed = client.get("/api/admin/connections", headers=admin)
        assert [item["id"] for item in listed.json()] == [
            "anthropic",
            "openai",
            "email",
            "stripe",
            "sec",
            "market",
            "storage",
        ]
        saved = client.put(
            "/api/admin/connections/anthropic",
            headers=admin,
            json={"values": {"api_key": "sk-ant-new-9999"}},
        )
        assert saved.status_code == 200
        assert saved.json()["fields"][0]["hint"] == "•••• 9999"
        # The AI review library and the wish check now use the new key.
        assert os.environ["ANTHROPIC_API_KEY"] == "sk-ant-new-9999"
        assert app.state.settings.anthropic_api_key == "sk-ant-new-9999"
        assert app.state.wish_matcher.client is not None

        bad = client.put(
            "/api/admin/connections/email", headers=admin, json={"values": {"port": "0"}}
        )
        assert (bad.status_code, bad.json()["detail"]) == (
            422,
            "Port must be a number from 1 to 65535",
        )
        missing = client.post("/api/admin/connections/nope/test", headers=admin)
        assert missing.status_code == 404


def test_stripe_check_validates_keys_and_asks_stripe(monkeypatch):
    seen = []

    def stripe(request):
        seen.append(request)
        key = base64.b64decode(request.headers["Authorization"].split()[1]).decode()
        return httpx.Response(200 if key == "sk_test_good:" else 401, json={})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        module.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(stripe), **kwargs),
    )

    def check(**values):
        service = ConnectionsService(base_settings(**values), FakeDb())
        return asyncio.run(service.test("stripe", {}))["message"]

    assert check() == "No secret key is set."
    assert check(stripe_secret_key="hello").startswith("That isn't a Stripe secret key")
    assert "different modes" in check(
        stripe_secret_key="sk_test_good", stripe_publishable_key="pk_live_x"
    )
    assert "whsec_" in check(stripe_secret_key="sk_test_good", stripe_webhook_secret="nope")
    assert seen == []  # bad shapes are caught before calling Stripe
    assert check(stripe_secret_key="sk_test_bad") == (
        "Stripe rejected the secret key (invalid or revoked)."
    )
    assert check(stripe_secret_key="sk_test_good") == (
        "Key works (test mode). Still to add: publishable key, webhook signing secret."
    )
    assert (
        check(
            stripe_secret_key="sk_test_good",
            stripe_publishable_key="pk_test_x",
            stripe_webhook_secret="whsec_x",
        )
        == "Key works (test mode)."
    )
    assert str(seen[-1].url) == "https://api.stripe.com/v1/balance"
