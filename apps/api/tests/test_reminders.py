import asyncio
import smtplib
from datetime import date, timedelta
from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy.config import Settings
from stockbuddy.main import app, current_user
from stockbuddy.reminders import ReminderService, estimated_next_report, reminder_message
from stockbuddy.supabase import SupabaseError

USER_ID = UUID("00000000-0000-0000-0000-000000000001")


def due(**overrides):
    return {
        "id": "40000000-0000-0000-0000-000000000001",
        "ticker": "AAPL",
        "company_name": "Apple Inc.",
        "last_report_date": "2026-07-31",
        "remind_on": "2026-10-27",
        "email": "owner@example.com",
        **overrides,
    }


class ReminderRepository:
    def __init__(self, rows=None, error=None):
        self.rows = rows or []
        self.error = error
        self.marked = []
        self.created = None
        self.deleted = None

    async def due_reminders(self, today):
        self.today = today
        return self.rows

    async def mark_reminder(self, reminder_id, status, *, error=None):
        self.marked.append((reminder_id, status, error))

    async def create_reminder(self, token, user_id, reminder):
        if self.error:
            raise self.error
        self.created = (token, user_id, reminder)
        return {"id": "40000000-0000-0000-0000-000000000002", "status": "pending"}

    async def list_reminders(self, token):
        return [due()]

    async def delete_reminder(self, token, reminder_id):
        self.deleted = reminder_id
        return True


class Mailer:
    def __init__(self, fail=False):
        self.fail = fail
        self.sent = []

    def send(self, message):
        if self.fail:
            raise smtplib.SMTPException("relay refused")
        self.sent.append(message)


def configured(**overrides):
    return Settings(
        smtp_host="smtp.example.com", smtp_from="MyPortfolioBuddy <r@example.com>", **overrides
    )


def test_estimated_next_report_is_one_quarter_later():
    assert estimated_next_report(date(2026, 7, 31)) == date(2026, 10, 30)


def test_message_goes_to_the_saved_email_and_explains_the_estimate():
    message = reminder_message(due(), "MyPortfolioBuddy <r@example.com>")

    assert message["To"] == "owner@example.com"
    assert message["Subject"] == "MyPortfolioBuddy reminder: AAPL report coming up"
    body = message.get_content()
    assert "Apple Inc. (AAPL)" in body
    assert "2026-10-30" in body
    assert "estimate" in body


def test_due_reminders_are_sent_and_marked():
    repository = ReminderRepository([due()])
    mailer = Mailer()
    service = ReminderService(
        configured(), repository, mailer=mailer, today=lambda: date(2026, 10, 27)
    )

    assert asyncio.run(service.send_due()) == 1
    assert repository.today == "2026-10-27"
    assert len(mailer.sent) == 1
    assert repository.marked == [("40000000-0000-0000-0000-000000000001", "sent", None)]


def test_failed_delivery_is_recorded_without_stopping_the_batch():
    repository = ReminderRepository([due()])
    service = ReminderService(configured(), repository, mailer=Mailer(fail=True))

    assert asyncio.run(service.send_due()) == 0
    assert repository.marked == [
        ("40000000-0000-0000-0000-000000000001", "failed", "relay refused")
    ]


def test_nothing_is_sent_when_email_is_not_configured():
    repository = ReminderRepository([due()])
    mailer = Mailer()
    service = ReminderService(Settings(smtp_host="", smtp_from=""), repository, mailer=mailer)

    assert asyncio.run(service.send_due()) == 0
    assert mailer.sent == []
    assert repository.marked == []


def _client(repository):
    app.dependency_overrides[current_user] = lambda: USER_ID
    client = TestClient(app)
    client.__enter__()
    app.state.repository = repository
    return client


def test_create_reminder_uses_the_session_and_rejects_past_dates():
    repository = ReminderRepository()
    client = _client(repository)
    try:
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        created = client.post(
            "/api/reminders",
            headers={"Authorization": "Bearer test-token"},
            json={"ticker": "aapl", "remind_on": tomorrow, "last_report_date": "2026-07-31"},
        )
        past = client.post(
            "/api/reminders",
            headers={"Authorization": "Bearer test-token"},
            json={"ticker": "AAPL", "remind_on": "2020-01-01"},
        )
    finally:
        client.__exit__(None, None, None)
        app.dependency_overrides.clear()

    assert created.status_code == 201
    token, user_id, reminder = repository.created
    assert token == "test-token"
    assert user_id == USER_ID
    assert reminder.ticker == "AAPL"
    assert past.status_code == 422


def test_duplicate_reminder_is_a_clear_conflict():
    repository = ReminderRepository(
        error=SupabaseError('Supabase REST POST report_reminders failed: {"code":"23505"}')
    )
    client = _client(repository)
    try:
        response = client.post(
            "/api/reminders",
            headers={"Authorization": "Bearer test-token"},
            json={"ticker": "AAPL", "remind_on": (date.today() + timedelta(days=3)).isoformat()},
        )
    finally:
        client.__exit__(None, None, None)
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]
