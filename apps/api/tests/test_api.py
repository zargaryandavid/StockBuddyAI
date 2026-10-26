from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy.main import app, current_user

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
PORTFOLIO_ID = UUID("10000000-0000-0000-0000-000000000001")


class FakeRepository:
    def __init__(self, portfolio):
        self.portfolio = portfolio
        self.updated = None
        self.deleted = None
        self.applied = None
        self.transactions = []

    async def get_portfolio(self, portfolio_id, user_id):
        assert user_id == USER_ID
        return self.portfolio if portfolio_id == PORTFOLIO_ID else None

    async def update_portfolio(self, token, portfolio_id, payload):
        self.updated = (token, portfolio_id, payload)
        return {"id": str(portfolio_id), "name": payload.name, "cash": payload.cash}

    async def delete_portfolio(self, token, portfolio_id):
        self.deleted = (token, portfolio_id)
        return True

    async def apply_transaction(self, token, portfolio_id, transaction):
        self.applied = (token, portfolio_id, transaction)
        return {
            "id": "30000000-0000-0000-0000-000000000001",
            "portfolio_id": str(portfolio_id),
            **transaction.model_dump(mode="json"),
        }

    async def list_transactions(self, token, portfolio_id):
        assert token == "test-token"
        assert portfolio_id == PORTFOLIO_ID
        return self.transactions


def user_override():
    return USER_ID


class ReadyAnalysis:
    """Stands in for the review service; its AI key check passes unless told otherwise."""

    def __init__(self, problem=None, blockers=None):
        self.problem = problem
        self.blockers = blockers or {}
        self.args = None

    async def ready(self):
        return self.problem

    async def review_blockers(self, tickers, as_of):
        return {ticker: self.blockers.get(ticker) for ticker in tickers}

    async def run(self, *args):
        self.args = args


def test_analysis_rejects_portfolios_the_user_does_not_own():
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = FakeRepository(None)
            response = client.post(
                "/api/analyses",
                headers={"Authorization": "Bearer test-token"},
                json={
                    "portfolio_id": str(PORTFOLIO_ID),
                    "ticker": "AAPL",
                    "as_of": "2024-12-31",
                },
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404


def test_analysis_rejects_a_ticker_not_held_in_the_portfolio():
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = FakeRepository(
                {"portfolio_positions": [{"ticker": "MSFT", "shares": 10}]}
            )
            response = client.post(
                "/api/analyses",
                headers={"Authorization": "Bearer test-token"},
                json={
                    "portfolio_id": str(PORTFOLIO_ID),
                    "ticker": "AAPL",
                    "as_of": "2024-12-31",
                },
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422
    assert "held" in response.json()["detail"]


def test_portfolio_can_be_updated_without_creating_a_duplicate():
    repository = FakeRepository({})
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            response = client.put(
                f"/api/portfolios/{PORTFOLIO_ID}",
                headers={"Authorization": "Bearer test-token"},
                json={
                    "name": "Updated",
                    "cash": 0,
                    "positions": [{"ticker": "AAPL", "shares": 12, "display_order": 3}],
                },
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert repository.updated[1] == PORTFOLIO_ID
    assert repository.updated[2].positions[0].shares == 12
    assert repository.updated[2].positions[0].display_order == 3


def test_portfolio_can_be_deleted():
    repository = FakeRepository({})
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            response = client.delete(
                f"/api/portfolios/{PORTFOLIO_ID}",
                headers={"Authorization": "Bearer test-token"},
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 204
    assert repository.deleted == ("test-token", PORTFOLIO_ID)


def test_buy_transaction_is_delegated_to_atomic_repository_operation():
    repository = FakeRepository(
        {
            "id": str(PORTFOLIO_ID),
            "name": "Core",
            "cash": 0,
            "portfolio_positions": [{"ticker": "AAPL", "shares": 10, "purchase_price": 100}],
        }
    )
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            response = client.post(
                f"/api/portfolios/{PORTFOLIO_ID}/transactions",
                headers={"Authorization": "Bearer test-token"},
                json={"ticker": "AAPL", "kind": "buy", "quantity": 5, "price": 130},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert repository.applied[0] == "test-token"
    assert repository.applied[1] == PORTFOLIO_ID
    assert repository.applied[2].ticker == "AAPL"
    assert repository.applied[2].quantity == 5
    assert repository.applied[2].price == 130


def test_transaction_history_is_returned_for_owned_portfolio():
    repository = FakeRepository(
        {
            "id": str(PORTFOLIO_ID),
            "name": "Core",
            "cash": 0,
            "portfolio_positions": [],
        }
    )
    repository.transactions = [
        {
            "id": "30000000-0000-0000-0000-000000000001",
            "portfolio_id": str(PORTFOLIO_ID),
            "ticker": "AAPL",
            "kind": "buy",
            "quantity": 5,
            "price": 130,
            "transacted_at": "2026-10-23T19:00:00Z",
        }
    ]
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            response = client.get(
                f"/api/portfolios/{PORTFOLIO_ID}/transactions",
                headers={"Authorization": "Bearer test-token"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["ticker"] == "AAPL"


def test_ai_features_stop_with_a_clear_message_at_the_daily_limit():
    class Studio:
        def daily_limit(self, feature):
            return 0

    class LimitedRepository(FakeRepository):
        async def load_settings(self):
            return Studio()

        async def use_ai_feature(self, token, feature, daily_limit):
            self.used = (feature, daily_limit)
            return False

    repository = LimitedRepository({"portfolio_positions": [{"ticker": "AAPL", "shares": 1}]})
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            app.state.analysis = ReadyAnalysis()
            review = client.post(
                "/api/analyses",
                headers={"Authorization": "Bearer test-token"},
                json={"portfolio_id": str(PORTFOLIO_ID), "ticker": "AAPL", "as_of": "2024-12-31"},
            )
            screenshot = client.post(
                "/api/portfolios/extract-image",
                headers={"Authorization": "Bearer test-token"},
                files={"image": ("a.png", b"png", "image/png")},
            )
    finally:
        app.dependency_overrides.clear()
    assert review.status_code == 429
    assert "this month's Ask Buddy tokens" in review.json()["detail"]
    assert screenshot.status_code == 429
    assert repository.used == ("screenshot_import", 0)


def test_a_review_for_today_uses_the_latest_final_close():
    from stockbuddy.main import latest_review_date

    class Studio:
        def daily_limit(self, feature):
            return 10

    class RecordingRepository(FakeRepository):
        async def load_settings(self):
            return Studio()

        async def use_ai_feature(self, token, feature, daily_limit):
            return True

        async def create_run(self, user_id, portfolio_id, ticker, as_of):
            self.as_of = as_of
            return {"id": "10000000-0000-0000-0000-000000000009", "ticker": ticker, "as_of": as_of}

    repository = RecordingRepository({"portfolio_positions": [{"ticker": "AAPL", "shares": 1}]})
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            app.state.analysis = ReadyAnalysis()
            response = client.post(
                "/api/analyses",
                headers={"Authorization": "Bearer test-token"},
                json={"portfolio_id": str(PORTFOLIO_ID), "ticker": "AAPL", "as_of": "2099-01-01"},
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 202
    assert repository.as_of == latest_review_date().isoformat()


def test_a_review_with_a_broken_ai_key_is_refused_without_using_a_token():
    class Studio:
        def daily_limit(self, feature):
            return 10

    class CountingRepository(FakeRepository):
        used = 0

        async def load_settings(self):
            return Studio()

        async def use_ai_feature(self, token, feature, daily_limit):
            self.used += 1
            return True

    repository = CountingRepository({"portfolio_positions": [{"ticker": "AAPL", "shares": 1}]})
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            app.state.analysis = ReadyAnalysis("Anthropic rejected the API key.")
            response = client.post(
                "/api/analyses",
                headers={"Authorization": "Bearer test-token"},
                json={"portfolio_id": str(PORTFOLIO_ID), "ticker": "AAPL", "as_of": "2024-12-31"},
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 503
    assert "Anthropic rejected the API key." in response.json()["detail"]
    assert "No token was used" in response.json()["detail"]
    assert repository.used == 0


def test_ai_usage_reports_tokens_left_today():
    class Studio:
        def daily_limit(self, feature):
            return {"ai_review": 10, "screenshot_import": 20, "wish_check": 100}[feature]

    class UsageRepository(FakeRepository):
        async def load_settings(self):
            return Studio()

        async def ai_usage_today(self, token):
            assert token == "test-token"
            return {"ai_review": 7}

    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = UsageRepository(None)
            response = client.get("/api/ai-usage", headers={"Authorization": "Bearer test-token"})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    review = response.json()["ai_review"]
    assert {key: review[key] for key in ("used", "limit", "left", "period")} == {
        "used": 7,
        "limit": 10,
        "left": 3,
        "period": "month",
    }
    assert review["resets_on"].endswith("-01")
    wishes = response.json()["wish_check"]
    assert (wishes["left"], wishes["period"]) == (100, "day")


def test_review_tokens_reset_on_the_first_of_next_month():
    from datetime import date

    from stockbuddy.repository import ai_usage_period

    assert ai_usage_period("ai_review", date(2026, 10, 26)) == (
        date(2026, 10, 1),
        date(2026, 11, 1),
    )
    assert ai_usage_period("ai_review", date(2026, 12, 31)) == (date(2026, 12, 1), date(2027, 1, 1))
    assert ai_usage_period("wish_check", date(2026, 10, 26)) == (
        date(2026, 10, 26),
        date(2026, 10, 27),
    )


def test_a_holding_without_enough_filings_is_refused_without_using_a_token():
    class Studio:
        def daily_limit(self, feature):
            return 10

    class CountingRepository(FakeRepository):
        used = 0

        async def load_settings(self):
            return Studio()

        async def use_ai_feature(self, token, feature, daily_limit):
            self.used += 1
            return True

    repository = CountingRepository({"portfolio_positions": [{"ticker": "SPCX", "shares": 1}]})
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            app.state.analysis = ReadyAnalysis(
                blockers={"SPCX": "Only 2 of 4 quarters of financials are filed so far."}
            )
            response = client.post(
                "/api/analyses",
                headers={"Authorization": "Bearer test-token"},
                json={"portfolio_id": str(PORTFOLIO_ID), "ticker": "SPCX", "as_of": "2024-12-31"},
            )
            readiness = client.get(
                "/api/analyses/readiness?tickers=spcx,AAPL",
                headers={"Authorization": "Bearer test-token"},
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "SPCX can't be reviewed yet. Only 2 of 4 quarters of financials are filed so far. "
        "No token was used."
    )
    assert repository.used == 0
    assert readiness.json() == {
        "AAPL": None,
        "SPCX": "Only 2 of 4 quarters of financials are filed so far.",
    }


def test_on_a_serverless_host_the_review_finishes_before_the_answer():
    class Studio:
        def daily_limit(self, feature):
            return 10

    class InlineRepository(FakeRepository):
        async def load_settings(self):
            return Studio()

        async def use_ai_feature(self, token, feature, daily_limit):
            return True

        async def create_run(self, user_id, portfolio_id, ticker, as_of):
            return {"id": "10000000-0000-0000-0000-000000000009", "status": "pending"}

        async def get_run(self, run_id, user_id):
            return {"id": str(run_id), "status": "completed"}

    analysis = ReadyAnalysis()
    app.dependency_overrides[current_user] = user_override
    try:
        with TestClient(app) as client:
            app.state.repository = InlineRepository(
                {"portfolio_positions": [{"ticker": "AAPL", "shares": 1}]}
            )
            app.state.analysis = analysis
            app.state.settings = app.state.settings.model_copy(update={"serverless": True})
            response = client.post(
                "/api/analyses",
                headers={"Authorization": "Bearer test-token"},
                json={"portfolio_id": str(PORTFOLIO_ID), "ticker": "AAPL", "as_of": "2024-12-31"},
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 202
    assert response.json()["status"] == "completed"
    assert analysis.args[3] == "AAPL"


def test_reminder_cron_needs_the_secret():
    class Reminders:
        calls = 0

        async def send_due(self):
            self.calls += 1
            return 2

    reminders = Reminders()
    with TestClient(app) as client:
        app.state.reminders = reminders
        app.state.settings = app.state.settings.model_copy(update={"cron_secret": ""})
        unset = client.get("/api/cron/reminders", headers={"Authorization": "Bearer x"})
        app.state.settings = app.state.settings.model_copy(update={"cron_secret": "s3cret"})
        wrong = client.get("/api/cron/reminders", headers={"Authorization": "Bearer nope"})
        right = client.get("/api/cron/reminders", headers={"Authorization": "Bearer s3cret"})
    assert (unset.status_code, wrong.status_code) == (401, 401)
    assert right.json() == {"sent": 2}
    assert reminders.calls == 1


def test_vercel_uses_tmp_for_caches_and_runs_serverless(monkeypatch):
    from stockbuddy.config import Settings

    monkeypatch.setenv("VERCEL", "1")
    on_vercel = Settings()
    monkeypatch.delenv("VERCEL")
    local = Settings()
    assert (on_vercel.serverless, on_vercel.sec_cache_dir) == (True, "/tmp/stockbuddy/sec")
    assert (local.serverless, local.sec_cache_dir) == (False, ".cache/sec")
