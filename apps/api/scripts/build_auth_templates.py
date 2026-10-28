# ruff: noqa: E501  (email markup and copy are naturally long lines)
"""Writes the Supabase sign-in emails into supabase/templates/ from the shared email layout.

Run after changing stockbuddy/emails.py or the texts below:
    cd apps/api && uv run python scripts/build_auth_templates.py
Then paste each file into Supabase Dashboard -> Authentication -> Emails (subjects are in
supabase/config.toml and docs/OPERATIONS.md). {{ ... }} are Supabase's own placeholders.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from stockbuddy.emails import Email, render  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "supabase" / "templates"

CONFIRM = "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email"
RECOVERY = "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery"
EMAIL_CHANGE = "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change"
MAGIC_LINK = "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink"
SIGN_IN = "{{ .SiteURL }}/login"

TEMPLATES = {
    "confirmation.html": Email(
        title="Confirm your email for MyPortfolioBuddy",
        preheader="One click to confirm your email and finish signing up.",
        heading="Confirm your email",
        paragraphs=[
            "You&rsquo;re one step away. Confirm <strong>{{ .Email }}</strong> to finish creating your "
            "MyPortfolioBuddy account.",
        ],
        button_label="Confirm my email",
        button_url=CONFIRM,
        after=[
            "This link works once and expires in 1 hour. After confirming you&rsquo;ll be signed in, "
            "and we&rsquo;ll send a short welcome guide."
        ],
        note="Didn&rsquo;t sign up for MyPortfolioBuddy? You can ignore this email. "
        "No account is created until the address is confirmed.",
    ),
    "recovery.html": Email(
        title="Reset your MyPortfolioBuddy password",
        preheader="Choose a new password for your MyPortfolioBuddy account.",
        heading="Reset your password",
        paragraphs=[
            "We received a request to reset the password for <strong>{{ .Email }}</strong>.",
            "Choose a new one with the button below. It needs at least 10 characters, with letters and numbers.",
        ],
        button_label="Choose a new password",
        button_url=RECOVERY,
        after=[
            "This link works once and expires in 1 hour. Open it in the browser where you asked for it."
        ],
        note="Didn&rsquo;t ask for this? You can ignore this email; your password stays the same.",
    ),
    "email_change.html": Email(
        title="Confirm your new email for MyPortfolioBuddy",
        preheader="Confirm the new email address for your MyPortfolioBuddy account.",
        heading="Confirm your new email",
        paragraphs=[
            "You asked to change the email on your MyPortfolioBuddy account from "
            "<strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.",
            "Confirm the change with the button below:",
        ],
        button_label="Confirm new email",
        button_url=EMAIL_CHANGE,
        after=["This link works once and expires in 1 hour."],
        note="Didn&rsquo;t ask for this? Ignore this email and your email stays the same, "
        "then change your password to be safe.",
    ),
    "magic_link.html": Email(
        title="Your MyPortfolioBuddy sign-in link",
        preheader="Your one-time link to sign in to MyPortfolioBuddy.",
        heading="Sign in to MyPortfolioBuddy",
        paragraphs=[
            "Use the button below to sign in as <strong>{{ .Email }}</strong>. No password needed."
        ],
        button_label="Sign me in",
        button_url=MAGIC_LINK,
        after=["This link works once and expires in 1 hour."],
        note="Didn&rsquo;t ask to sign in? You can ignore this email.",
    ),
    "reauthentication.html": Email(
        title="Your MyPortfolioBuddy security code",
        preheader="Your code to confirm it's you.",
        heading="Confirm it&rsquo;s you",
        paragraphs=["Enter this code in MyPortfolioBuddy to finish the change you started:"],
        code="{{ .Token }}",
        after=["The code expires in a few minutes."],
        note="Didn&rsquo;t try to change anything? Change your password and contact us.",
    ),
    "password_changed_notification.html": Email(
        title="Your MyPortfolioBuddy password was changed",
        preheader="The password on your MyPortfolioBuddy account was just changed.",
        heading="Your password was changed",
        paragraphs=[
            "The password for <strong>{{ .Email }}</strong> was just changed. If that was you, there&rsquo;s nothing else to do.",
        ],
        button_label="Sign in",
        button_url=SIGN_IN,
        note="Didn&rsquo;t change it? Use &ldquo;Forgot password?&rdquo; on the sign-in page right away "
        "to choose a new one, and reply to this email so we can help.",
    ),
    "email_changed_notification.html": Email(
        title="Your MyPortfolioBuddy email was changed",
        preheader="The email on your MyPortfolioBuddy account was changed.",
        heading="Your email was changed",
        paragraphs=[
            "The email on your MyPortfolioBuddy account was changed from <strong>{{ .OldEmail }}</strong> "
            "to <strong>{{ .Email }}</strong>.",
        ],
        note="Didn&rsquo;t change it? Reply to this email right away so we can secure your account.",
    ),
}


def main() -> None:
    for name, email in TEMPLATES.items():
        (OUT / name).write_text(render(email))
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
