from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy.controls import IndustrySetting, PersonaSetting, StudioSettings
from stockbuddy.industries import DEFAULT_INDUSTRIES
from stockbuddy.main import app
from stockbuddy.personas import PERSONAS, builtin_prompts
from stockbuddy.supabase import Account

ADMIN = Account(id=UUID("00000000-0000-0000-0000-000000000099"), email="admin@example.com")
USER = Account(id=UUID("00000000-0000-0000-0000-000000000001"), email="owner@example.com")


class Gateway:
    async def identify(self, token: str) -> Account:
        return ADMIN if token == "admin" else USER

    def is_admin(self, account: Account) -> bool:
        return account.email == ADMIN.email


class Repository:
    def __init__(self):
        defaults = builtin_prompts()
        self.settings = StudioSettings(
            max_position_pct=0.25,
            max_industry_pct=0.25,
            deep_value_weight=0.7,
            trajectory_weight=0.3,
            llm_model="claude-opus-5-5",
            industries=tuple(
                IndustrySetting(item.name, item.icon, item.sort_order)
                for item in DEFAULT_INDUSTRIES
            ),
            personas=tuple(
                PersonaSetting(
                    persona=persona.persona,
                    display_name=persona.display_name,
                    strategy=persona.strategy,
                    prompt=defaults[persona.persona],
                    default_prompt=defaults[persona.persona],
                )
                for persona in PERSONAS
            ),
        )
        self.saved = None

    async def load_settings(self):
        return self.settings

    async def save_settings(self, settings):
        self.saved = settings
        self.settings = settings
        return settings


def test_user_cannot_read_or_change_the_studio():
    with TestClient(app) as client:
        app.state.gateway = Gateway()
        response = client.get("/api/admin/config", headers={"Authorization": "Bearer user"})
    assert response.status_code == 403


def test_admin_can_save_prompts_and_book_settings():
    repository = Repository()
    prompts = builtin_prompts()
    prompts["buffett"] = (
        prompts["buffett"].replace("Warren", "Warren", 1) + "\nStay inside the contract."
    )
    with TestClient(app) as client:
        app.state.gateway = Gateway()
        app.state.repository = repository
        response = client.put(
            "/api/admin/config",
            headers={"Authorization": "Bearer admin"},
            json={
                "max_position_pct": 0.2,
                "max_industry_pct": 0.25,
                "deep_value_weight": 0.6,
                "llm_model": "claude-opus-5-5",
                "min_cash_pct": 0.08,
                "industries": [
                    {"name": item.name, "icon": item.icon} for item in DEFAULT_INDUSTRIES
                ],
                "prompts": [
                    {"persona": name, "prompt": prompt} for name, prompt in prompts.items()
                ],
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["max_position_pct"] == 0.2
    assert body["max_industry_pct"] == 0.25
    assert body["trajectory_weight"] == 0.4
    assert len(body["industries"]) == 12
    assert body["industries"][7]["name"] == "Information Technology"
    assert body["industries"][7]["icon"] == "cpu"
    saved = {persona["persona"]: persona["prompt"] for persona in body["personas"]}
    assert "Stay inside the contract." in saved["buffett"]
    assert repository.saved is not None
    assert repository.saved.llm_model == "claude-opus-5-5"
    assert body["use_transaction_history_analytics"] is True
    assert repository.saved.use_transaction_history_analytics is True
    assert body["min_cash_pct"] == 0.08
    assert repository.saved.min_cash_pct == 0.08


def test_admin_can_disable_transaction_history_analytics():
    repository = Repository()
    prompts = builtin_prompts()
    with TestClient(app) as client:
        app.state.gateway = Gateway()
        app.state.repository = repository
        response = client.put(
            "/api/admin/config",
            headers={"Authorization": "Bearer admin"},
            json={
                "max_position_pct": 0.25,
                "max_industry_pct": 0.25,
                "deep_value_weight": 0.7,
                "llm_model": "claude-opus-5-5",
                "use_transaction_history_analytics": False,
                "industries": [
                    {"name": item.name, "icon": item.icon} for item in DEFAULT_INDUSTRIES
                ],
                "prompts": [
                    {"persona": name, "prompt": prompt} for name, prompt in prompts.items()
                ],
            },
        )
        public = client.get("/api/settings", headers={"Authorization": "Bearer user"})
    assert response.status_code == 200
    assert response.json()["use_transaction_history_analytics"] is False
    assert repository.saved.use_transaction_history_analytics is False
    assert public.status_code == 200
    assert public.json()["use_transaction_history_analytics"] is False
    assert "personas" not in public.json()


def test_admin_can_reset_their_own_ai_tokens_for_today():
    class ResettingRepository(Repository):
        reset_for = None

        async def reset_ai_usage_today(self, user_id):
            self.reset_for = user_id
            return 2

    repository = ResettingRepository()
    with TestClient(app) as client:
        app.state.gateway = Gateway()
        app.state.repository = repository
        refused = client.post("/api/admin/ai-usage/reset", headers={"Authorization": "Bearer user"})
        response = client.post(
            "/api/admin/ai-usage/reset", headers={"Authorization": "Bearer admin"}
        )
    assert refused.status_code == 403
    assert response.status_code == 200
    assert response.json() == {"reset": 2}
    assert repository.reset_for == ADMIN.id


def test_people_can_delete_their_own_account_but_not_the_admin():
    class DeletingGateway(Gateway):
        deleted = []

        async def delete_user(self, user_id):
            self.deleted.append(user_id)

    gateway = DeletingGateway()
    with TestClient(app) as client:
        app.state.gateway = gateway
        user = {"Authorization": "Bearer user"}
        unconfirmed = client.request(
            "DELETE", "/api/account", headers=user, json={"confirm": "yes"}
        )
        admin = client.request(
            "DELETE",
            "/api/account",
            headers={"Authorization": "Bearer admin"},
            json={"confirm": "delete"},
        )
        done = client.request("DELETE", "/api/account", headers=user, json={"confirm": " Delete "})
    assert unconfirmed.status_code == 422
    assert admin.status_code == 403
    assert done.status_code == 204
    assert gateway.deleted == [USER.id]
