from datetime import date
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from stockbuddy.main import app, current_user
from stockbuddy.schemas import FireEntryInput

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
ENTRY_ID = UUID("50000000-0000-0000-0000-000000000001")
ASSET_ID = UUID("40000000-0000-0000-0000-000000000001")


class FireRepository:
    def __init__(self, settings=None):
        self.settings = settings
        self.created = None
        self.saved = None

    async def list_fire_entries(self, token):
        assert token == "test-token"
        return []

    async def create_fire_entry(self, token, user_id, entry):
        self.created = (token, user_id, entry)
        return {"id": str(ENTRY_ID), **entry.model_dump(mode="json")}

    async def update_fire_entry(self, token, user_id, entry_id, entry):
        return None if entry_id != ENTRY_ID else {"id": str(entry_id)}

    async def delete_fire_entry(self, token, entry_id):
        return entry_id == ENTRY_ID

    async def list_fire_assets(self, token):
        return [{"id": str(ASSET_ID), "asset_type": "residential", "name": "Condo"}]

    async def create_fire_asset(self, token, user_id, asset):
        self.created_asset = (user_id, asset)
        return {"id": str(ASSET_ID), **asset.model_dump(mode="json")}

    async def update_fire_asset(self, token, asset_id, asset):
        return None if asset_id != ASSET_ID else {"id": str(asset_id)}

    async def delete_fire_asset(self, token, asset_id):
        return asset_id == ASSET_ID

    async def get_fire_settings(self, token):
        return self.settings

    async def save_fire_settings(self, token, user_id, settings):
        self.saved = (user_id, settings)
        return settings.model_dump()


def client_for(repository):
    app.dependency_overrides[current_user] = lambda: USER_ID
    client = TestClient(app)
    client.__enter__()
    app.state.repository = repository
    return client


def close(client):
    client.__exit__(None, None, None)
    app.dependency_overrides.clear()


HEADERS = {"Authorization": "Bearer test-token"}


def test_entry_category_must_match_its_kind():
    with pytest.raises(ValidationError, match="not a expense category"):
        FireEntryInput(
            kind="expense", category="salary", name="Pay", amount=1, starts_on=date(2026, 1, 1)
        )


def test_entry_cannot_end_before_it_starts():
    with pytest.raises(ValidationError, match="end date"):
        FireEntryInput(
            kind="expense",
            category="rent",
            name="Rent",
            amount=1,
            starts_on=date(2026, 2, 1),
            ends_on=date(2026, 1, 1),
        )


def test_create_bond_income_keeps_principal_yield_and_maturity():
    repository = FireRepository()
    client = client_for(repository)
    try:
        response = client.post(
            "/api/fire/entries",
            headers=HEADERS,
            json={
                "kind": "income",
                "category": "bond",
                "name": "  US Treasury 2030 ",
                "amount": 200,
                "frequency": "semiannual",
                "starts_on": "2026-12-15",
                "ends_on": "2030-12-15",
                "principal": 10000,
                "yield_pct": 4,
            },
        )
    finally:
        close(client)

    assert response.status_code == 201
    token, user_id, entry = repository.created
    assert (token, user_id) == ("test-token", USER_ID)
    assert entry.name == "US Treasury 2030"
    assert entry.principal == 10000
    assert entry.ends_on == date(2030, 12, 15)


def test_missing_entries_are_not_found():
    client = client_for(FireRepository())
    try:
        missing = UUID("50000000-0000-0000-0000-000000000099")
        updated = client.put(
            f"/api/fire/entries/{missing}",
            headers=HEADERS,
            json={
                "kind": "expense",
                "category": "rent",
                "name": "Rent",
                "amount": 1,
                "starts_on": "2026-01-01",
            },
        )
        deleted = client.delete(f"/api/fire/entries/{missing}", headers=HEADERS)
        removed = client.delete(f"/api/fire/entries/{ENTRY_ID}", headers=HEADERS)
    finally:
        close(client)

    assert updated.status_code == 404
    assert deleted.status_code == 404
    assert removed.status_code == 204


def test_settings_fall_back_to_defaults_and_save():
    repository = FireRepository()
    client = client_for(repository)
    try:
        defaults = client.get("/api/fire/settings", headers=HEADERS)
        saved = client.put(
            "/api/fire/settings",
            headers=HEADERS,
            json={"expected_return_pct": 6, "retirement_annual_spend": 60000},
        )
    finally:
        close(client)

    assert defaults.json() == {
        "expected_return_pct": 7,
        "retirement_annual_spend": None,
        "monthly_invest": None,
        "withdrawal_rate_pct": 4,
        "inflation_pct": 3,
    }
    assert saved.status_code == 200
    assert repository.saved[0] == USER_ID
    assert repository.saved[1].retirement_annual_spend == 60000


class Market:
    def fx_rate(self, source, target):
        return {("AMD", "USD"): 0.0025}.get((source.upper(), target.upper()))


def test_exchange_rate_endpoint_converts_and_reports_missing_pairs():
    client = client_for(FireRepository())
    try:
        app.state.market = Market()
        found = client.get("/api/fx?from=amd&to=USD", headers=HEADERS)
        missing = client.get("/api/fx?from=XYZ&to=USD", headers=HEADERS)
        invalid = client.get("/api/fx?from=AM&to=USD", headers=HEADERS)
    finally:
        close(client)

    assert found.json() == {"from": "AMD", "to": "USD", "rate": 0.0025}
    assert missing.status_code == 404
    assert invalid.status_code == 422


def test_bond_face_value_is_quantity_times_price():
    entry = FireEntryInput(
        kind="income",
        category="bond",
        name="AMTLB",
        amount=1270750,
        currency="AMD",
        frequency="semiannual",
        starts_on=date(2026, 12, 1),
        principal=1,
        yield_pct=11.5,
        quantity=221,
        unit_price=100000,
    )

    assert entry.principal == 22100000


def test_settings_ignore_unknown_columns_and_fill_missing_ones():
    repository = FireRepository(
        settings={"user_id": "x", "expected_return_pct": 6, "updated_at": "2026-01-01"}
    )
    client = client_for(repository)
    try:
        body = client.get("/api/fire/settings", headers=HEADERS).json()
    finally:
        close(client)

    assert body == {
        "expected_return_pct": 6,
        "retirement_annual_spend": None,
        "monthly_invest": None,
        "withdrawal_rate_pct": 4,
        "inflation_pct": 3,
    }


class HistoryMarket:
    def close_history(self, tickers, start):
        self.request = (tickers, start)
        return {ticker: [{"date": "2026-10-22", "close": 100}] for ticker in tickers}


def test_price_history_normalizes_tickers_and_validates_range():
    market = HistoryMarket()
    client = client_for(FireRepository())
    try:
        app.state.market = market
        ok = client.get(
            "/api/prices/history?tickers=aapl,SPY,aapl&from=2026-01-01", headers=HEADERS
        )
        too_old = client.get("/api/prices/history?tickers=SPY&from=1990-01-01", headers=HEADERS)
        bad = client.get("/api/prices/history?tickers=$$$&from=2026-01-01", headers=HEADERS)
    finally:
        close(client)

    assert ok.status_code == 200
    assert market.request == (["AAPL", "SPY"], date(2026, 1, 1))
    assert set(ok.json()) == {"AAPL", "SPY"}
    assert too_old.status_code == 422
    assert bad.status_code == 422


def test_rental_income_creates_or_links_an_asset_and_others_cannot():
    rental = FireEntryInput(
        kind="income",
        category="rent_income",
        name="Condo rent",
        amount=1800,
        starts_on=date(2026, 11, 5),
        principal=350000,
        new_asset={"asset_type": "vacation", "name": " Beach condo ", "market_value": 350000},
    )
    # The property value lives on the asset, not on the income.
    assert rental.principal is None
    assert rental.new_asset is not None and rental.new_asset.name == "Beach condo"

    with pytest.raises(ValidationError, match="Only rental income"):
        FireEntryInput(
            kind="income",
            category="salary",
            name="Pay",
            amount=1,
            starts_on=date(2026, 1, 1),
            asset_id=ASSET_ID,
        )
    with pytest.raises(ValidationError, match="not both"):
        FireEntryInput(
            kind="income",
            category="rent_income",
            name="Rent",
            amount=1,
            starts_on=date(2026, 1, 1),
            asset_id=ASSET_ID,
            new_asset={"asset_type": "land", "name": "Lot"},
        )


def test_asset_endpoints_validate_and_report_missing_assets():
    repository = FireRepository()
    client = client_for(repository)
    try:
        listed = client.get("/api/fire/assets", headers=HEADERS)
        created = client.post(
            "/api/fire/assets",
            headers=HEADERS,
            json={"asset_type": "equipment", "name": "Excavator", "market_value": 60000},
        )
        bad_type = client.post(
            "/api/fire/assets", headers=HEADERS, json={"asset_type": "boat", "name": "Boat"}
        )
        missing = client.put(
            f"/api/fire/assets/{ENTRY_ID}",
            headers=HEADERS,
            json={"asset_type": "land", "name": "Lot"},
        )
        deleted = client.delete(f"/api/fire/assets/{ASSET_ID}", headers=HEADERS)
        not_found = client.delete(f"/api/fire/assets/{ENTRY_ID}", headers=HEADERS)
    finally:
        close(client)

    assert listed.json()[0]["name"] == "Condo"
    assert created.status_code == 201
    assert repository.created_asset[0] == USER_ID
    assert created.json()["currency"] == "USD"
    assert created.json()["location"] is None
    assert bad_type.status_code == 422
    assert missing.status_code == 404
    assert deleted.status_code == 204
    assert not_found.status_code == 404


def test_asset_location_is_trimmed_and_optional():
    from stockbuddy.schemas import FireAssetInput

    trimmed = FireAssetInput(asset_type="land", name="Lot", location="  Dilijan  ")
    assert trimmed.location == "Dilijan"
    assert FireAssetInput(asset_type="land", name="Lot", location="   ").location is None
    with pytest.raises(ValidationError):
        FireAssetInput(asset_type="land", name="Lot", location="x" * 201)
