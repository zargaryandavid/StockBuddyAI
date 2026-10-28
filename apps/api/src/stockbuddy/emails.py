# ruff: noqa: E501  (email markup and copy are naturally long lines)
"""One look for every MyPortfolioBuddy email: the sign-in emails Supabase sends (built from
this layout into supabase/templates/ by scripts/build_auth_templates.py) and the ones the
API sends itself, such as the goodbye email after an account is deleted.

Plain inline styles and tables only, because email apps ignore style sheets and most CSS.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html import escape

GREEN = "#1f4d32"
GOLD = "#e8c97a"
PAGE = "#eef3ec"
INK = "#111827"
TEXT = "#374151"
MUTED = "#6b7280"

# The green coin with a gold $, as in the app's logo, drawn with HTML so every email app
# shows it (many block images by default).
_COIN = (
    f'<span style="display:inline-block;width:30px;height:30px;line-height:28px;border-radius:50%;'
    f"background:{GREEN};border:2px solid {GOLD};color:{GOLD};font:700 18px Georgia,'Times New Roman',serif;"
    f'text-align:center;vertical-align:middle;">$</span>'
)


@dataclass(frozen=True)
class Email:
    """What one email says. Text may contain simple HTML (strong, br, links) already escaped."""

    title: str
    preheader: str
    heading: str
    paragraphs: list[str]
    button_label: str | None = None
    button_url: str | None = None
    code: str | None = None
    after: list[str] = field(default_factory=list)
    note: str | None = None


def render(email: Email) -> str:
    """The email as a complete HTML document."""
    body = "".join(
        f'<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:{TEXT};">{text}</p>'
        for text in email.paragraphs
    )
    button = ""
    if email.button_label and email.button_url:
        button = (
            '<tr><td align="left" style="padding:12px 32px 8px;">'
            f'<a href="{email.button_url}" style="display:inline-block;background:{GOLD};color:#1b2b1f;'
            'text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;">'
            f"{email.button_label}</a></td></tr>"
        )
    code = ""
    if email.code:
        code = (
            '<tr><td align="left" style="padding:8px 32px 8px;">'
            f'<div style="display:inline-block;padding:14px 22px;border-radius:10px;background:{PAGE};'
            f"border:1px dashed {GREEN};font:700 28px/1 'SFMono-Regular',Menlo,Consolas,monospace;"
            f'letter-spacing:6px;color:{GREEN};">{email.code}</div></td></tr>'
        )
    after = "".join(
        f'<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:{MUTED};">{text}</p>'
        for text in email.after
    )
    fallback = ""
    if email.button_url:
        fallback = (
            f'<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:{MUTED};">'
            "Button not working? Copy this link into your browser:<br>"
            f'<a href="{email.button_url}" style="color:{GREEN};word-break:break-all;">{email.button_url}</a></p>'
        )
    note = ""
    if email.note:
        note = (
            '<tr><td style="padding:16px 32px 28px;">'
            f'<div style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:13px;line-height:1.5;color:{MUTED};">'
            f"{email.note}</div></td></tr>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{email.title}</title>
</head>
<body style="margin:0;padding:0;background:{PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{email.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAGE};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d9e4d5;">
      <tr><td style="background:{GREEN};padding:20px 32px;">
        {_COIN}<span style="margin-left:10px;font-size:17px;font-weight:700;color:#ffffff;vertical-align:middle;">MyPortfolio<span style="color:{GOLD};">Buddy</span></span>
        <div style="font-size:13px;color:#cfe0c8;margin-top:6px;">Your AI buddy for your portfolio and your path to financial freedom</div>
      </td></tr>
      <tr><td style="padding:32px 32px 8px;">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:{INK};">{email.heading}</h1>
        {body}
      </td></tr>
      {code}{button}
      <tr><td style="padding:12px 32px 4px;">{after}{fallback}</td></tr>
      {note}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:16px 32px;font-size:12px;line-height:1.6;color:{MUTED};text-align:center;">
        No sponsors, no ads, and we never sell your data.<br>
        MyPortfolioBuddy is a study tool, not financial advice.<br>
        <a href="https://www.myportfoliobuddy.com" style="color:{MUTED};">myportfoliobuddy.com</a> &middot; &copy; 2026 AIAutomationLA.com
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
"""


def account_deleted(email_address: str) -> tuple[str, str, str]:
    """Subject, HTML and plain text of the goodbye email after an account is deleted."""
    address = escape(email_address)
    message = Email(
        title="Your MyPortfolioBuddy account was deleted",
        preheader="Your account and all its data are gone. Thanks for trying MyPortfolioBuddy.",
        heading="Your account was deleted",
        paragraphs=[
            f"As you asked, we deleted the MyPortfolioBuddy account for <strong>{address}</strong> "
            "and everything in it: your portfolios, FIRE plan, assets, wishes, ratings and share links.",
            "Thanks for trying MyPortfolioBuddy. If you ever want to come back, you are always welcome "
            "to sign up again with a fresh start.",
        ],
        button_label="Visit MyPortfolioBuddy",
        button_url="https://www.myportfoliobuddy.com",
        after=["Backups that still hold deleted data expire on their own schedule."],
        note="Didn&rsquo;t delete your account? Reply to this email right away so we can help.",
    )
    text = (
        f"Your MyPortfolioBuddy account for {email_address} was deleted, with all its data: "
        "portfolios, FIRE plan, assets, wishes, ratings and share links.\n\n"
        "Thanks for trying MyPortfolioBuddy. You're always welcome to sign up again.\n\n"
        "Didn't delete your account? Reply to this email right away.\n\n"
        "https://www.myportfoliobuddy.com"
    )
    return "Your MyPortfolioBuddy account was deleted", render(message), text
