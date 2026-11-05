from types import SimpleNamespace
from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy import main
from stockbuddy.main import app, current_user, holding_changes
from stockbuddy.schemas import PositionInput

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
PORTFOLIO_ID = UUID("91000000-0000-0000-0000-000000000001")


def position(ticker, shares, cost):
    return PositionInput(ticker=ticker, shares=shares, purchase_price=cost)


def test_new_more_fewer_and_removed_holdings_become_buys_and_sells():
    before = [
        {"ticker": "VOO", "shares": 10, "purchase_price": 500},
        {"ticker": "NVDA", "shares": 20, "purchase_price": 100},
        {"ticker": "AAL", "shares": 5, "purchase_price": 12},
        {"ticker": "TSLA", "shares": 3, "purchase_price": 400},
    ]
    after = [
        # 10 more VOO, average now 550: the new shares cost (550×20 − 500×10) ÷ 10 = 600.
        position("VOO", 20, 550),
        position("NVDA", 15, 100),
        position("TSLA", 3, 400),
        position("vo", 35, 80.14),
    ]
    assert holding_changes(before, after) == [
        {"ticker": "VOO", "kind": "buy", "quantity": 10, "price": 600},
        {"ticker": "NVDA", "kind": "sell", "quantity": 5, "price": None},
        {"ticker": "VO", "kind": "buy", "quantity": 35, "price": 80.14},
        {"ticker": "AAL", "kind": "sell", "quantity": 5, "price": None},
    ]


def test_saving_holdings_writes_their_history_without_failing_the_save():
    written = []

    class Db:
        async def rest(self, method, table, *, token=None, params=None, json=None, prefer=None):
            written.append((method, table, token, json))
            return None

    class Repository:
        db = Db()

        async def get_portfolio(self, portfolio_id, user_id):
            return {
                "portfolio_positions": [{"ticker": "NVDA", "shares": 20, "purchase_price": 100}]
            }

        async def update_portfolio(self, token, portfolio_id, payload):
            return {"id": str(portfolio_id), "name": payload.name}

    class Prices:
        def get_prices(self, ticker, start, end, **kwargs):
            return [SimpleNamespace(time="2026-11-04", close=180.5)]

    app.dependency_overrides[current_user] = lambda: USER_ID
    try:
        with TestClient(app) as client:
            app.state.repository = Repository()
            app.state.market = SimpleNamespace(prices=Prices())
            response = client.put(
                f"/api/portfolios/{PORTFOLIO_ID}",
                headers={"Authorization": "Bearer user-token"},
                json={
                    "name": "Main",
                    "cash": 0,
                    "positions": [
                        {"ticker": "NVDA", "shares": 15, "purchase_price": 100},
                        {"ticker": "AVUV", "shares": 40, "purchase_price": 121.38},
                    ],
                },
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    method, table, token, rows = written[-1]
    assert (method, table, token) == ("POST", "portfolio_transactions", "user-token")
    assert [(row["ticker"], row["kind"], row["quantity"], row["price"]) for row in rows] == [
        ("NVDA", "sell", 5, 180.5),
        ("AVUV", "buy", 40, 121.38),
    ]
    assert all(row["user_id"] == str(USER_ID) for row in rows)
    assert main.holding_changes([], []) == []


def test_a_past_trade_can_be_kept_in_history_only():
    calls = []

    class Db:
        async def rest(self, method, table, *, token=None, params=None, json=None, prefer=None):
            calls.append((method, table, json))
            return [{**json, "id": "t1"}]

    class Repository:
        db = Db()

        async def get_portfolio(self, portfolio_id, user_id):
            return {"portfolio_positions": [{"ticker": "VO", "shares": 35}]}

        async def apply_transaction(self, token, portfolio_id, transaction):
            raise AssertionError("history-only trades must not change the holdings")

    app.dependency_overrides[current_user] = lambda: USER_ID
    try:
        with TestClient(app) as client:
            app.state.repository = Repository()
            response = client.post(
                f"/api/portfolios/{PORTFOLIO_ID}/transactions",
                headers={"Authorization": "Bearer user-token"},
                json={
                    "ticker": "vo",
                    "kind": "buy",
                    "quantity": 35,
                    "price": 80.14,
                    "transacted_at": "2026-11-03T12:00:00Z",
                    "history_only": True,
                },
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 201
    method, table, row = calls[-1]
    assert (method, table) == ("POST", "portfolio_transactions")
    assert row["ticker"] == "VO" and row["quantity"] == 35 and row["price"] == 80.14
    assert row["transacted_at"].startswith("2026-11-03T12:00:00")


def test_edit_and_remove_a_transaction_through_the_database_functions():
    from stockbuddy.supabase import SupabaseError

    calls = []

    class Db:
        fail = False

        async def rest(self, method, table, *, token=None, params=None, json=None, prefer=None):
            calls.append((table, json))
            if self.fail:
                raise SupabaseError(
                    "Supabase REST POST rpc failed: "
                    '{"message":"holdings have fewer VO shares than this change needs"}'
                )
            return [{"id": "t1", "ticker": "VO", "quantity": 40}]

    db = Db()

    class Repository:
        pass

    Repository.db = db
    app.dependency_overrides[current_user] = lambda: USER_ID
    headers = {"Authorization": "Bearer user-token"}
    base = f"/api/portfolios/{PORTFOLIO_ID}/transactions/22000000-0000-0000-0000-000000000001"
    try:
        with TestClient(app) as client:
            app.state.repository = Repository()
            edited = client.put(
                base,
                headers=headers,
                json={
                    "ticker": "vo",
                    "kind": "buy",
                    "quantity": 40,
                    "price": 79,
                    "transacted_at": "2026-11-03T12:00:00Z",
                },
            )
            removed = client.delete(base + "?adjust_holdings=false", headers=headers)
            db.fail = True
            refused = client.delete(base, headers=headers)
    finally:
        app.dependency_overrides.clear()
    assert edited.status_code == 200 and edited.json()["quantity"] == 40
    assert calls[0][0] == "rpc/edit_portfolio_transaction"
    assert calls[0][1]["new_ticker"] == "VO" and calls[0][1]["adjust_holdings"] is True
    assert removed.status_code == 204
    assert calls[1] == (
        "rpc/remove_portfolio_transaction",
        {"target_transaction_id": "22000000-0000-0000-0000-000000000001", "adjust_holdings": False},
    )
    assert refused.status_code == 422 and "enough shares" in refused.json()["detail"]
