import asyncio
from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy.main import app, current_account, current_user
from stockbuddy.schemas import ProfileInput
from stockbuddy.sharing import ShareService, new_token
from stockbuddy.supabase import Account

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
PORTFOLIO_ID = "91000000-0000-0000-0000-000000000001"
HEADERS = {"Authorization": "Bearer test-token"}


class Market:
    def __init__(self):
        self.lookups = 0

    def resolve(self, ticker, base_currency="USD"):
        self.lookups += 1
        if ticker == "GONE":
            raise RuntimeError("no quote")
        return {"name": f"{ticker} Inc.", "price": 100.0, "day_change_percent": 1.5}

    def fx_rate(self, source, target):
        return {"AMD": 1 / 400}.get(source)


class Repository:
    def __init__(self):
        self.links = [
            {
                "token": "f" * 43,
                "user_id": str(USER_ID),
                "kind": "fire",
                "portfolio_id": PORTFOLIO_ID,
            },
            {
                "token": "p" * 43,
                "user_id": str(USER_ID),
                "kind": "portfolio",
                "portfolio_id": PORTFOLIO_ID,
            },
        ]
        self.created = None
        self.deleted = None

    async def find_share_link(self, share_token):
        return next((link for link in self.links if link["token"] == share_token), None)

    async def shared_owner_name(self, user_id):
        return "Davit"

    async def get_portfolio(self, portfolio_id, user_id):
        return {
            "name": "Long term",
            "cash": 500,
            "base_currency": "USD",
            "benchmark": "SPY",
            "user_email": "never@shown.example",
            "portfolio_positions": [
                {"ticker": "AAPL", "shares": 10, "purchase_price": 80, "sector": "Tech"},
                {"ticker": "GONE", "shares": 2, "purchase_price": 5},
            ],
        }

    async def shared_owner_data(self, user_id):
        return {
            "entries": [{"name": "Pay", "currency": "USD"}, {"name": "Bond", "currency": "AMD"}],
            "settings": {"withdrawal_rate_pct": 4},
            "assets": [],
        }

    async def list_share_links(self, token):
        return [
            {"token": link["token"], "kind": link["kind"], "portfolio_id": link["portfolio_id"]}
            for link in self.links
        ]

    async def create_share_link(self, token, user_id, share_token, kind, portfolio_id):
        self.created = (kind, portfolio_id, share_token)
        return {"token": share_token, "kind": kind, "portfolio_id": str(portfolio_id)}

    async def delete_share_link(self, token, share_token):
        self.deleted = share_token
        return share_token == "f" * 43


def test_tokens_are_long_and_unique():
    tokens = {new_token() for _ in range(50)}
    assert len(tokens) == 50
    assert all(len(token) >= 40 for token in tokens)


def test_shared_portfolio_is_priced_and_leaves_out_private_details():
    market = Market()
    service = ShareService(Repository(), market)
    page = asyncio.run(service.page("p" * 43))
    assert page["kind"] == "portfolio"
    assert page["owner_name"] == "Davit"
    holdings = page["portfolio"]["positions"]
    assert holdings[0] == {
        "ticker": "AAPL",
        "name": "AAPL Inc.",
        "shares": 10,
        "purchase_price": 80,
        "price": 100.0,
        "day_change_percent": 1.5,
        "sector": "Tech",
        "asset_type": None,
    }
    # A ticker without a quote is still listed, just unpriced.
    assert holdings[1]["price"] is None
    assert "never@shown" not in str(page)

    # The page is cached, so repeat views don't look prices up again.
    asyncio.run(service.page("p" * 43))
    assert market.lookups == 2


def test_shared_fire_plan_includes_entries_and_exchange_rates():
    page = asyncio.run(ShareService(Repository(), Market()).page("f" * 43))
    assert page["kind"] == "fire"
    assert page["currency"] == "USD"
    assert page["rates"] == {"AMD": 1 / 400}
    assert [entry["name"] for entry in page["entries"]] == ["Pay", "Bond"]
    assert asyncio.run(ShareService(Repository(), Market()).page("x" * 43)) is None


def test_link_endpoints_and_public_view():
    repository = Repository()
    app.dependency_overrides[current_user] = lambda: USER_ID
    app.dependency_overrides[current_account] = lambda: Account(
        id=USER_ID, email="owner@example.com"
    )
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            app.state.shares = ShareService(repository, Market())
            # Asking again for a link that is already on returns the same link.
            existing = client.post("/api/share-links", headers=HEADERS, json={"kind": "fire"})
            other = "92000000-0000-0000-0000-000000000001"
            created = client.post(
                "/api/share-links",
                headers=HEADERS,
                json={"kind": "portfolio", "portfolio_id": other},
            )
            missing_portfolio = client.post(
                "/api/share-links", headers=HEADERS, json={"kind": "portfolio"}
            )
            public = client.get("/api/share/" + "p" * 43)
            unknown = client.get("/api/share/" + "z" * 43)
            short = client.get("/api/share/abc")
            off = client.delete("/api/share-links/" + "f" * 43, headers=HEADERS)
    finally:
        app.dependency_overrides.clear()

    assert existing.status_code == 201 and existing.json()["token"] == "f" * 43
    assert repository.created[0:2] == ("portfolio", UUID(other))
    assert len(created.json()["token"]) >= 40
    assert missing_portfolio.status_code == 422
    assert public.status_code == 200 and public.json()["portfolio"]["name"] == "Long term"
    assert unknown.status_code == 404 and short.status_code == 404
    assert off.status_code == 204 and repository.deleted == "f" * 43


def test_profile_name_is_tidied():
    assert ProfileInput(display_name="  Davit   Z ").display_name == "Davit Z"
    assert ProfileInput(display_name="   ").display_name is None
