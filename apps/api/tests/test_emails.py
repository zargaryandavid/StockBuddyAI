import asyncio

from stockbuddy import main
from stockbuddy.config import Settings
from stockbuddy.emails import account_deleted


def test_goodbye_email_names_the_account_and_escapes_it():
    subject, html, text = account_deleted("<owner>@example.com")
    assert subject == "Your MyPortfolioBuddy account was deleted"
    assert "&lt;owner&gt;@example.com" in html and "<owner>" not in html
    assert "MyPortfolio" in html and "Buddy" in html
    assert "<owner>@example.com" in text


def test_goodbye_is_sent_when_email_is_set_up(monkeypatch):
    sent = []
    monkeypatch.setattr(main.SmtpMailer, "send", lambda self, message: sent.append(message))
    settings = Settings(smtp_host="smtp.example.com", smtp_from="MyPortfolioBuddy <hi@example.com>")
    asyncio.run(main.send_goodbye(settings, "owner@example.com"))
    assert len(sent) == 1
    assert sent[0]["To"] == "owner@example.com"
    assert sent[0].get_body(preferencelist=("html",)) is not None


def test_goodbye_is_skipped_without_email_settings_and_never_raises(monkeypatch):
    sent = []
    monkeypatch.setattr(main.SmtpMailer, "send", lambda self, message: sent.append(message))
    asyncio.run(main.send_goodbye(Settings(smtp_host="", smtp_from=""), "owner@example.com"))
    assert sent == []

    def broken(self, message):
        raise OSError("SMTP down")

    monkeypatch.setattr(main.SmtpMailer, "send", broken)
    settings = Settings(smtp_host="smtp.example.com", smtp_from="hi@example.com")
    asyncio.run(main.send_goodbye(settings, "owner@example.com"))  # no exception


def test_welcome_goes_out_only_right_after_confirming(monkeypatch):
    from datetime import UTC, datetime, timedelta
    from uuid import UUID

    from fastapi.testclient import TestClient

    from stockbuddy.supabase import Account

    sent = []
    monkeypatch.setattr(main.SmtpMailer, "send", lambda self, message: sent.append(message))
    fresh = (datetime.now(UTC) - timedelta(minutes=2)).isoformat()
    stale = (datetime.now(UTC) - timedelta(days=3)).isoformat()
    who = UUID("00000000-0000-0000-0000-000000000001")
    try:
        with TestClient(main.app) as client:
            main.app.state.settings = Settings(
                smtp_host="smtp.example.com",
                smtp_from="MyPortfolioBuddy <hi@example.com>",
                web_origin="https://www.myportfoliobuddy.com",
            )
            main.app.dependency_overrides[main.current_account] = lambda: Account(
                id=who, email="new@example.com", email_confirmed=True, email_confirmed_at=fresh
            )
            assert client.post("/api/emails/welcome").json() == {"sent": True}
            main.app.dependency_overrides[main.current_account] = lambda: Account(
                id=who, email="old@example.com", email_confirmed=True, email_confirmed_at=stale
            )
            assert client.post("/api/emails/welcome").json() == {"sent": False}
    finally:
        main.app.dependency_overrides.clear()
    assert [message["To"] for message in sent] == ["new@example.com"]
    assert (
        "https://www.myportfoliobuddy.com/"
        in sent[0].get_body(preferencelist=("html",)).get_content()
    )


def test_link_shared_email_shows_the_link_and_how_to_stop():
    from stockbuddy.emails import link_shared

    subject, html, text = link_shared(
        "owner@example.com", "https://www.myportfoliobuddy.com/share/abc", "your portfolio “Core”"
    )
    assert subject == "Your MyPortfolioBuddy share link is ready"
    assert "https://www.myportfoliobuddy.com/share/abc" in html
    assert "turn the link off" in html
    assert "your portfolio “Core”" in text
