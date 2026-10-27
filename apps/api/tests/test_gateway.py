import asyncio

import httpx

from stockbuddy.config import Settings
from stockbuddy.supabase import SupabaseGateway

USER_ID = "00000000-0000-0000-0000-000000000099"


def gateway_returning(user: dict) -> SupabaseGateway:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/auth/v1/user"
        return httpx.Response(200, json=user)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    settings = Settings(supabase_url="http://supabase.test", ADMIN_LOGIN_EMAIL="Admin@Example.com")
    return SupabaseGateway(settings, client)


def test_admin_requires_the_admin_email_to_be_confirmed():
    confirmed = gateway_returning(
        {"id": USER_ID, "email": "admin@example.com", "email_confirmed_at": "2026-10-26T10:00:00Z"}
    )
    account = asyncio.run(confirmed.identify("token"))
    assert account.email_confirmed is True
    assert confirmed.is_admin(account) is True

    # Someone who signed up with the admin's address but never confirmed it.
    unconfirmed = gateway_returning(
        {"id": USER_ID, "email": "admin@example.com", "email_confirmed_at": None}
    )
    account = asyncio.run(unconfirmed.identify("token"))
    assert account.email_confirmed is False
    assert unconfirmed.is_admin(account) is False


def test_other_confirmed_users_are_not_admins():
    gateway = gateway_returning(
        {"id": USER_ID, "email": "owner@example.com", "email_confirmed_at": "2026-10-26T10:00:00Z"}
    )
    assert gateway.is_admin(asyncio.run(gateway.identify("token"))) is False


def test_api_responses_carry_security_headers():
    from fastapi.testclient import TestClient

    from stockbuddy.main import app

    with TestClient(app) as client:
        response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"


def test_a_burst_of_requests_asks_supabase_who_the_token_is_once():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.headers["authorization"])
        return httpx.Response(200, json={"id": USER_ID, "email": "owner@example.com"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    gateway = SupabaseGateway(Settings(supabase_url="http://supabase.test"), client)

    async def burst():
        for _ in range(5):
            await gateway.identify("token")
        gateway.forget_identity("token")
        await gateway.identify("token")

    asyncio.run(burst())
    assert calls == ["Bearer token", "Bearer token"]


def test_a_rejected_token_is_not_remembered():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"msg": "bad"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    gateway = SupabaseGateway(Settings(supabase_url="http://supabase.test"), client)
    import pytest

    from stockbuddy.supabase import SupabaseError

    with pytest.raises(SupabaseError):
        asyncio.run(gateway.identify("bad"))
    assert "bad" not in gateway._identities
