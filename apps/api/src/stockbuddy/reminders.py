from __future__ import annotations

import asyncio
import logging
import smtplib
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from email.message import EmailMessage
from typing import Any

from stockbuddy.config import Settings

logger = logging.getLogger(__name__)

QUARTER_DAYS = 91


def utc_today() -> date:
    """The database's current_date is UTC, so reminders use the UTC calendar day."""
    return datetime.now(UTC).date()


def estimated_next_report(last_report: date) -> date:
    """Quarterly filers report about every three months; this is only an estimate."""
    return last_report + timedelta(days=QUARTER_DAYS)


def reminder_message(reminder: dict[str, Any], sender: str) -> EmailMessage:
    ticker = reminder["ticker"]
    company = reminder.get("company_name") or ticker
    message = EmailMessage()
    message["From"] = sender
    message["To"] = reminder["email"]
    message["Subject"] = f"StockBuddy reminder: {ticker} report coming up"
    lines = [f"You asked StockBuddy to remind you about {company} ({ticker})."]
    last = reminder.get("last_report_date")
    if last:
        expected = estimated_next_report(date.fromisoformat(last))
        lines.append(
            f"Its last SEC report was filed on {last}. Quarterly reports usually follow "
            f"about three months later, so the next one is expected around {expected}."
        )
        lines.append("This date is an estimate; the company announces the exact date.")
    lines.append("")
    lines.append("StockBuddy is a study tool and never places trades.")
    message.set_content("\n".join(lines))
    return message


class SmtpMailer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send(self, message: EmailMessage) -> None:
        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=30) as smtp:
            if self.settings.smtp_starttls:
                smtp.starttls()
            if self.settings.smtp_username:
                smtp.login(self.settings.smtp_username, self.settings.smtp_password)
            smtp.send_message(message)


class ReminderService:
    def __init__(
        self,
        settings: Settings,
        repository: Any,
        mailer: Any | None = None,
        today: Callable[[], date] = utc_today,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.mailer = mailer or SmtpMailer(settings)
        self.today = today

    async def send_due(self) -> int:
        if not self.settings.email_enabled:
            return 0
        sent = 0
        for reminder in await self.repository.due_reminders(self.today().isoformat()):
            try:
                message = reminder_message(reminder, self.settings.smtp_from)
                await asyncio.to_thread(self.mailer.send, message)
            except (OSError, smtplib.SMTPException) as exc:
                logger.warning("Reminder %s could not be sent: %s", reminder["id"], exc)
                await self.repository.mark_reminder(reminder["id"], "failed", error=str(exc)[:500])
                continue
            await self.repository.mark_reminder(reminder["id"], "sent")
            sent += 1
        return sent
