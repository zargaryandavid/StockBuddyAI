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
    # Numbered steps, each (title, text): used to show what to do first.
    steps: list[tuple[str, str]] = field(default_factory=list)
    # A highlighted box, e.g. a link to keep: (label, content).
    highlight: tuple[str, str] | None = None
    # Hide the "Button not working?" line (when the box already shows the link).
    plain_link: bool = True
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
    steps = ""
    if email.steps:
        items = "".join(
            '<tr><td valign="top" style="padding:0 12px 14px 0;width:34px;">'
            f'<span style="display:inline-block;width:28px;height:28px;line-height:28px;border-radius:50%;'
            f'background:{GREEN};color:{GOLD};font-weight:700;font-size:14px;text-align:center;">{number}</span></td>'
            f'<td valign="top" style="padding:3px 0 14px;"><div style="font-size:15px;font-weight:700;color:{INK};">{title}</div>'
            f'<div style="font-size:14px;line-height:1.5;color:{TEXT};margin-top:2px;">{text}</div></td></tr>'
            for number, (title, text) in enumerate(email.steps, start=1)
        )
        steps = (
            '<tr><td style="padding:4px 32px 4px;">'
            f'<table role="presentation" cellpadding="0" cellspacing="0" width="100%">{items}</table></td></tr>'
        )
    highlight = ""
    if email.highlight:
        label, content = email.highlight
        highlight = (
            '<tr><td style="padding:4px 32px 8px;">'
            f'<div style="padding:14px 16px;border-radius:10px;background:{PAGE};border:1px solid #cfe0c8;">'
            f'<div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:{GREEN};">{label}</div>'
            f'<div style="margin-top:6px;font-size:14px;line-height:1.5;word-break:break-all;color:{INK};">{content}</div>'
            "</div></td></tr>"
        )
    after = "".join(
        f'<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:{MUTED};">{text}</p>'
        for text in email.after
    )
    fallback = ""
    if email.button_url and email.plain_link:
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
      {steps}{highlight}{code}{button}
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


def welcome(email_address: str, site_url: str) -> tuple[str, str, str]:
    """Subject, HTML and plain text of the welcome email, sent once the address is confirmed."""
    address = escape(email_address)
    message = Email(
        title="Welcome to MyPortfolioBuddy!",
        preheader="You're in. Three quick steps to see your whole financial picture.",
        heading="Welcome, you&rsquo;re in!",
        paragraphs=[
            f"Your account <strong>{address}</strong> is confirmed. MyPortfolioBuddy puts your "
            "portfolio, savings and plan for financial freedom in one calm place. Fundamentals, not hype.",
            "Three steps get you the full picture:",
        ],
        steps=[
            (
                "Add your income and expenses",
                "In FIRE: salary, rent and bills, plus savings, CDs and bonds. "
                "It works out when your money could pay for your life.",
            ),
            (
                "Add your portfolio",
                "Type your holdings, upload your broker&rsquo;s positions file, or a screenshot. "
                "See your real exposure, including what your ETFs hold.",
            ),
            (
                "Check Today",
                "Your net worth, cash target and anything that needs a look, every time you open the app.",
            ),
        ],
        button_label="Open MyPortfolioBuddy",
        button_url=f"{site_url}/",
        plain_link=False,
        after=[
            "Curious about the long run? Try the Growth calculator under Portfolio to see the compound effect."
        ],
        note="MyPortfolioBuddy is a study tool, not financial advice. Questions or ideas? Just reply to this email.",
    )
    text = (
        f"Welcome to MyPortfolioBuddy! Your account {email_address} is confirmed.\n\n"
        "Three steps to the full picture:\n"
        "1. Add your income and expenses in FIRE.\n"
        "2. Add your portfolio: type it, upload a broker file, or a screenshot.\n"
        "3. Check Today for your net worth and cash target.\n\n"
        f"Open MyPortfolioBuddy: {site_url}/\n"
    )
    return "Welcome to MyPortfolioBuddy!", render(message), text


def link_shared(email_address: str, link: str, what: str) -> tuple[str, str, str]:
    """Subject, HTML and plain text of the note sent when someone turns a share link on.

    `what` is plain text such as "your FIRE plan" or "your portfolio “Long-term”".
    """
    shown = escape(what)
    url = escape(link)
    message = Email(
        title="Your MyPortfolioBuddy share link is ready",
        preheader=f"You shared {what}. Here's the link to send.",
        heading="Your share link is ready",
        paragraphs=[
            f"You shared <strong>{shown}</strong>. Anyone with this link can see it, "
            "with your display name, but never your email, and nothing else in your account.",
        ],
        highlight=("Your link", f'<a href="{url}" style="color:{GREEN};">{url}</a>'),
        button_label="Open the shared page",
        button_url=url,
        plain_link=False,
        after=[
            "Send it by message or email to the people you choose. What they see updates as your numbers change.",
            "To stop sharing, open your profile (click your email in the menu) and turn the link off. "
            "Anyone holding it loses access at once.",
        ],
        note=f"Didn&rsquo;t share anything? Turn the link off from your profile and change your password. "
        f"This was sent to {escape(email_address)}.",
    )
    text = (
        f"You shared {what} on MyPortfolioBuddy.\n\nYour link: {link}\n\n"
        "Anyone with this link can see it, with your display name. To stop sharing, turn it off "
        "from your profile; anyone holding the link loses access at once.\n"
    )
    return "Your MyPortfolioBuddy share link is ready", render(message), text
