import asyncio
from datetime import date
from uuid import UUID

from stockbuddy.personas import PERSONAS, builtin_prompts
from stockbuddy.repository import Repository
from stockbuddy.schemas import FireEntryInput, PortfolioCreate, PositionTransaction


class Gateway:
    def __init__(self):
        self.calls = []

    async def rest(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        return [{"id": "10000000-0000-0000-0000-000000000001"}]


def test_portfolio_update_uses_one_atomic_rpc():
    gateway = Gateway()
    repository = Repository(gateway)
    payload = PortfolioCreate(
        name="Long-term book",
        cash=2500,
        base_currency="EUR",
        benchmark="SPY",
        positions=[
            {
                "ticker": "AAPL",
                "shares": 4,
                "purchase_price": 100,
                "asset_type": "Common Stock",
                "sector": "Information Technology",
            }
        ],
    )

    asyncio.run(
        repository.update_portfolio(
            "user-token",
            UUID("10000000-0000-0000-0000-000000000001"),
            payload,
        )
    )

    assert len(gateway.calls) == 1
    method, path, kwargs = gateway.calls[0]
    assert (method, path) == ("POST", "rpc/update_portfolio")
    assert kwargs["token"] == "user-token"
    assert kwargs["json"]["portfolio_base_currency"] == "EUR"
    assert kwargs["json"]["portfolio_positions"][0]["ticker"] == "AAPL"


def test_transaction_uses_atomic_rpc_and_history_query_uses_user_token():
    gateway = Gateway()
    repository = Repository(gateway)
    portfolio_id = UUID("10000000-0000-0000-0000-000000000001")

    asyncio.run(
        repository.apply_transaction(
            "user-token",
            portfolio_id,
            PositionTransaction(ticker="aapl", kind="buy", quantity=2, price=150),
        )
    )
    asyncio.run(repository.list_transactions("user-token", portfolio_id))

    apply_method, apply_path, apply_kwargs = gateway.calls[0]
    assert (apply_method, apply_path) == (
        "POST",
        "rpc/apply_portfolio_transaction",
    )
    assert apply_kwargs["token"] == "user-token"
    assert apply_kwargs["json"]["transaction_ticker"] == "AAPL"
    assert apply_kwargs["json"]["transaction_quantity"] == 2

    list_method, list_path, list_kwargs = gateway.calls[1]
    assert (list_method, list_path) == ("GET", "portfolio_transactions")
    assert list_kwargs["token"] == "user-token"
    assert list_kwargs["params"]["portfolio_id"] == f"eq.{portfolio_id}"


class SettingsGateway:
    def __init__(self, settings_row):
        self.settings_row = settings_row
        self.calls = []

    async def rest(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if method != "GET":
            return None
        if path == "app_settings":
            return [self.settings_row]
        if path == "persona_prompts":
            return [
                {"persona": persona.persona, "prompt": prompt}
                for persona, prompt in zip(PERSONAS, builtin_prompts().values(), strict=True)
            ]
        return []


def _settings_row(**overrides):
    return {
        "max_position_pct": "0.2500",
        "max_industry_pct": "0.2500",
        "deep_value_weight": "0.7000",
        "trajectory_weight": "0.3000",
        "llm_model": "claude-opus-5-5",
        **overrides,
    }


def test_load_settings_reads_transaction_history_flag_and_defaults_on():
    disabled = Repository(SettingsGateway(_settings_row(use_transaction_history_analytics=False)))
    legacy = Repository(SettingsGateway(_settings_row()))

    assert asyncio.run(disabled.load_settings()).use_transaction_history_analytics is False
    assert asyncio.run(legacy.load_settings()).use_transaction_history_analytics is True


def test_save_settings_writes_transaction_history_flag():
    gateway = SettingsGateway(_settings_row(use_transaction_history_analytics=False))
    repository = Repository(gateway)
    settings = asyncio.run(repository.load_settings())

    asyncio.run(repository.save_settings(settings))

    patch = next(
        kwargs
        for method, path, kwargs in gateway.calls
        if method == "PATCH" and path == "app_settings"
    )
    assert patch["json"]["use_transaction_history_analytics"] is False


def test_rental_income_with_a_new_asset_creates_the_asset_first_and_links_it():
    gateway = Gateway()
    repository = Repository(gateway)
    user_id = UUID("00000000-0000-0000-0000-000000000001")
    entry = FireEntryInput(
        kind="income",
        category="rent_income",
        name="Condo rent",
        amount=1800,
        starts_on=date(2026, 11, 5),
        new_asset={"asset_type": "residential", "name": "Condo", "market_value": 350000},
    )

    asyncio.run(repository.create_fire_entry("user-token", user_id, entry))

    (asset_method, asset_path, asset_call), (entry_method, entry_path, entry_call) = gateway.calls
    assert (asset_method, asset_path) == ("POST", "fire_assets")
    assert asset_call["json"]["market_value"] == 350000
    assert asset_call["json"]["user_id"] == str(user_id)
    assert (entry_method, entry_path) == ("POST", "fire_entries")
    assert entry_call["json"]["asset_id"] == "10000000-0000-0000-0000-000000000001"
    assert "new_asset" not in entry_call["json"]


def test_cash_in_other_currencies_is_saved_beside_the_portfolio_as_its_owner():
    gateway = Gateway()
    repository = Repository(gateway)
    payload = PortfolioCreate(
        name="Mixed cash",
        cash=1000,
        base_currency="USD",
        other_cash=[
            {"currency": "amd", "amount": 500000},
            {"currency": "USD", "amount": 5},  # its own currency belongs in "cash"
        ],
    )

    saved = asyncio.run(repository.create_portfolio("user-token", payload))

    method, path, kwargs = gateway.calls[-1]
    assert (method, path) == ("PATCH", "portfolios")
    assert kwargs["token"] == "user-token"
    assert kwargs["params"] == {"id": "eq.10000000-0000-0000-0000-000000000001"}
    assert kwargs["json"] == {"other_cash": [{"currency": "AMD", "amount": 500000.0}]}
    assert saved["other_cash"] == [{"currency": "AMD", "amount": 500000.0}]
