from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy.main import app

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
HEADERS = {"Authorization": "Bearer user-token"}


class Gateway:
    async def authenticate(self, token: str) -> UUID:
        return USER_ID


class Db:
    def __init__(self, saved=None):
        self.calls = []
        self.saved = saved

    async def rest(self, method, table, *, token=None, params=None, json=None, prefer=None):
        self.calls.append({"method": method, "table": table, "token": token, "json": json})
        if method == "GET":
            return [self.saved] if self.saved else []
        return [json]


class Repository:
    def __init__(self, saved=None):
        self.db = Db(saved)


def run(repository, call):
    client = TestClient(app)
    client.__enter__()
    app.state.gateway = Gateway()
    app.state.repository = repository
    try:
        return call(client)
    finally:
        client.__exit__(None, None, None)


def test_empty_plan_until_one_is_saved():
    response = run(Repository(), lambda client: client.get("/api/allocation-plan", headers=HEADERS))
    assert response.json() == {"budget": 0, "currency": "USD", "items": [], "updated_at": None}


def test_saves_the_plan_as_the_owner_with_tidy_items():
    repository = Repository()
    response = run(
        repository,
        lambda client: client.put(
            "/api/allocation-plan",
            headers=HEADERS,
            json={
                "budget": 54000000,
                "currency": "amd",
                "items": [
                    {
                        "label": " International  equities ",
                        "ticker": "vxus",
                        "mode": "pct",
                        "value": 33,
                    },
                    {
                        "label": "Armenian bonds",
                        "ticker": "",
                        "mode": "amount",
                        "value": 7000000,
                        "expected_return_pct": 11.5,
                    },
                ],
            },
        ),
    )
    assert response.status_code == 200
    call = repository.db.calls[-1]
    assert call["token"] == "user-token" and call["table"] == "allocation_plans"
    assert call["json"]["user_id"] == str(USER_ID)
    assert call["json"]["currency"] == "AMD"
    assert call["json"]["items"][0] == {
        "label": "International equities",
        "ticker": "VXUS",
        "name": "",
        "mode": "pct",
        "value": 33.0,
        "expected_return_pct": None,
    }
    assert call["json"]["items"][1]["expected_return_pct"] == 11.5


def test_refuses_bad_symbols_and_too_many_rows():
    bad = run(
        Repository(),
        lambda client: client.put(
            "/api/allocation-plan", headers=HEADERS, json={"items": [{"ticker": "DROP TABLE"}]}
        ),
    )
    many = run(
        Repository(),
        lambda client: client.put(
            "/api/allocation-plan", headers=HEADERS, json={"items": [{"ticker": "VOO"}] * 41}
        ),
    )
    assert bad.status_code == 422 and many.status_code == 422
