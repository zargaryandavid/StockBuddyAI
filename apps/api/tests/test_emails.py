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
