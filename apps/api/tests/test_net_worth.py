from datetime import date, timedelta
from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy.main import app

USER_ID = UUID("00000000-0000-0000-0000-000000000001")


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
        if method == "GET":
            return [{"day": "2026-10-26", "total": 100.0}]
        return [json]


class Repository:
    def __init__(self):
        self.db = Db()


def client_with(repository):
    client = TestClient(app)
    client.__enter__()
    app.state.gateway = Gateway()
    app.state.repository = repository
    return client


def test_saves_one_reading_for_today_with_its_total():
    repository = Repository()
    client = client_with(repository)
    try:
        response = client.put(
            "/api/net-worth/today",
            headers={"Authorization": "Bearer user-token"},
            json={
                "day": date.today().isoformat(),
                "investments": 1000.254,
                "savings": 200,
                "other_assets": 50,
                "currency": "usd",
            },
        )
    finally:
        client.__exit__(None, None, None)
    assert response.status_code == 200
    call = repository.db.calls[-1]
    assert call["token"] == "user-token"  # saved as the person, so their row rules apply
    assert call["params"] == {"on_conflict": "user_id,day"}
    assert call["json"]["total"] == 1250.25
    assert call["json"]["currency"] == "USD"
    assert call["json"]["user_id"] == str(USER_ID)


def test_refuses_a_reading_for_another_day():
    client = client_with(Repository())
    try:
        response = client.put(
            "/api/net-worth/today",
            headers={"Authorization": "Bearer user-token"},
            json={
                "day": (date.today() - timedelta(days=10)).isoformat(),
                "investments": 1,
                "savings": 0,
                "other_assets": 0,
            },
        )
    finally:
        client.__exit__(None, None, None)
    assert response.status_code == 422


def test_history_needs_sign_in_and_reads_as_the_person():
    repository = Repository()
    client = client_with(repository)
    try:
        assert client.get("/api/net-worth").status_code == 401
        response = client.get("/api/net-worth", headers={"Authorization": "Bearer user-token"})
    finally:
        client.__exit__(None, None, None)
    assert response.json() == [{"day": "2026-10-26", "total": 100.0}]
    assert repository.db.calls[-1]["token"] == "user-token"
    assert repository.db.calls[-1]["params"]["order"] == "day.asc"
