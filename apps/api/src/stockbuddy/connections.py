"""Outside services an admin can configure in Admin -> Connections.

Each connection has fields that map onto `Settings`. A value saved in Admin is encrypted
and stored in `app_connections`; it wins over the same setting in `.env`. Saved secrets
are never sent back to the browser, only a hint with their last four characters.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import smtplib
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

import anthropic
import httpx
from cryptography.fernet import Fernet, InvalidToken

from stockbuddy.config import Settings

FieldKind = Literal["secret", "text", "port", "bool"]


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    setting: str
    kind: FieldKind = "text"
    placeholder: str = ""
    help: str = ""


@dataclass(frozen=True)
class Connection:
    id: str
    name: str
    purpose: str
    fields: tuple[Field, ...] = ()


CONNECTIONS: tuple[Connection, ...] = (
    Connection(
        "anthropic",
        "Claude (Anthropic)",
        "AI persona review on Run test, and the repeat check in the 300 wishes.",
        (
            Field(
                "api_key",
                "API key",
                "anthropic_api_key",
                "secret",
                "sk-ant-…",
                "From console.anthropic.com → API keys.",
            ),
        ),
    ),
    Connection(
        "openai",
        "OpenAI",
        "Reading holdings from a portfolio screenshot, and the persona review "
        "when Admin studio uses an OpenAI model.",
        (
            Field("api_key", "API key", "openai_api_key", "secret", "sk-…"),
            Field(
                "vision_model",
                "Screenshot model",
                "openai_vision_model",
                "text",
                "gpt-6-sol",
            ),
        ),
    ),
    Connection(
        "email",
        "Email (SMTP)",
        "Report-date reminder emails.",
        (
            Field("host", "SMTP server", "smtp_host", "text", "smtp.gmail.com"),
            Field("port", "Port", "smtp_port", "port", "587"),
            Field("username", "Username", "smtp_username", "text", "you@example.com"),
            Field(
                "password",
                "Password",
                "smtp_password",
                "secret",
                "",
                "For Gmail, use an app password.",
            ),
            Field("from_address", "Send from", "smtp_from", "text", "StockBuddy <you@example.com>"),
            Field("starttls", "Use STARTTLS", "smtp_starttls", "bool"),
        ),
    ),
    Connection(
        "stripe",
        "Payments (Stripe)",
        "Buying AI tokens. Not live yet: saving keys here does not turn buying on.",
        (
            Field(
                "secret_key",
                "Secret key",
                "stripe_secret_key",
                "secret",
                "sk_test_…",
                "From dashboard.stripe.com → Developers → API keys. Use test keys while testing.",
            ),
            Field(
                "publishable_key",
                "Publishable key",
                "stripe_publishable_key",
                "text",
                "pk_test_…",
                "Safe to show in the browser; must match the secret key's mode.",
            ),
            Field(
                "webhook_secret",
                "Webhook signing secret",
                "stripe_webhook_secret",
                "secret",
                "whsec_…",
                "From Developers → Webhooks after adding the endpoint.",
            ),
        ),
    ),
    Connection(
        "sec",
        "SEC EDGAR",
        "Company names, sectors, and report dates. The SEC asks for a contact email.",
        (
            Field(
                "user_agent",
                "Contact (app name and email)",
                "sec_user_agent",
                "text",
                "StockBuddy you@example.com",
            ),
        ),
    ),
    Connection(
        "market",
        "Market data (Yahoo Finance)",
        "Prices and history for holdings and benchmarks. No key needed.",
    ),
    Connection(
        "storage",
        "Picture storage (Supabase)",
        "Pictures for Education articles. Set up by the database migrations.",
    ),
)

BY_ID = {connection.id: connection for connection in CONNECTIONS}


class ConnectionSetupError(ValueError):
    pass


def _fernet(settings: Settings) -> Fernet:
    secret = settings.connections_encryption_key or settings.supabase_service_role_key
    if not secret:
        raise ConnectionSetupError("Set SUPABASE_SERVICE_ROLE_KEY to store connection settings")
    digest = hashlib.sha256(b"stockbuddy-connections:" + secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _hint(value: str) -> str:
    return f"•••• {value[-4:]}" if len(value) > 4 else "••••"


def _clean(field: Field, value: Any) -> str:
    """The value to store for a field, as text; raises a readable error when invalid."""
    if field.kind == "bool":
        if isinstance(value, bool):
            return "true" if value else "false"
        raise ConnectionSetupError(f"{field.label} must be on or off")
    text = str(value).strip()
    if not text:
        raise ConnectionSetupError(f"{field.label} can't be empty; clear it to use .env instead")
    if field.kind == "port":
        if not text.isdigit() or not 1 <= int(text) <= 65535:
            raise ConnectionSetupError("Port must be a number from 1 to 65535")
    if len(text) > (4000 if field.kind == "secret" else 300):
        raise ConnectionSetupError(f"{field.label} is too long")
    if field.setting in {"sec_user_agent", "smtp_from"} and "@" not in text:
        raise ConnectionSetupError(f"{field.label} must include an email address")
    return text


def _typed(field: Field, text: str) -> Any:
    if field.kind == "port":
        return int(text)
    if field.kind == "bool":
        return text == "true"
    return text


class ConnectionsService:
    def __init__(self, base: Settings, db: Any) -> None:
        self.base = base
        self.db = db
        self.saved: dict[str, dict[str, str]] = {}
        self.unreadable: set[str] = set()
        self.last_tests: dict[str, dict[str, Any]] = {}

    async def load(self) -> None:
        """Read and decrypt what the admin saved; an unreadable value is skipped."""
        try:
            rows = await self.db.rest(
                "GET", "app_connections", params={"select": "connection,field,value_encrypted"}
            )
        except Exception:  # table not migrated yet, or Supabase unreachable
            rows = []
        saved: dict[str, dict[str, str]] = {}
        unreadable: set[str] = set()
        fernet = _fernet(self.base) if rows else None
        for row in rows or []:
            try:
                value = fernet.decrypt(row["value_encrypted"].encode()).decode()
            except (InvalidToken, ValueError):
                unreadable.add(f"{row['connection']}.{row['field']}")
                continue
            saved.setdefault(row["connection"], {})[row["field"]] = value
        self.saved, self.unreadable = saved, unreadable

    def effective(self) -> Settings:
        """`.env` settings with the admin's saved values on top."""
        update: dict[str, Any] = {}
        for connection in CONNECTIONS:
            for field in connection.fields:
                value = self.saved.get(connection.id, {}).get(field.key)
                if value is not None:
                    update[field.setting] = _typed(field, value)
        return self.base.model_copy(update=update)

    def describe(self) -> list[dict[str, Any]]:
        effective = self.effective()
        described = []
        for connection in CONNECTIONS:
            fields = []
            for field in connection.fields:
                saved = self.saved.get(connection.id, {}).get(field.key)
                env_value = getattr(self.base, field.setting)
                current = getattr(effective, field.setting)
                source = (
                    "admin"
                    if saved is not None
                    else "env"
                    if env_value not in ("", None) and field.kind != "bool"
                    else "default"
                    if field.kind in {"bool", "port"}
                    else "unset"
                )
                entry: dict[str, Any] = {
                    "key": field.key,
                    "label": field.label,
                    "kind": field.kind,
                    "placeholder": field.placeholder,
                    "help": field.help,
                    "source": source,
                    "unreadable": f"{connection.id}.{field.key}" in self.unreadable,
                }
                if field.kind == "secret":
                    entry["hint"] = _hint(current) if current else None
                else:
                    entry["value"] = current
                fields.append(entry)
            configured = all(
                getattr(effective, field.setting) not in ("", None)
                for field in connection.fields
                if field.kind in {"secret"} or field.key in {"host", "from_address", "user_agent"}
            )
            described.append(
                {
                    "id": connection.id,
                    "name": connection.name,
                    "purpose": connection.purpose,
                    "configurable": bool(connection.fields),
                    "configured": configured,
                    "fields": fields,
                    "last_test": self.last_tests.get(connection.id),
                }
            )
        return described

    async def save(self, connection_id: str, values: dict[str, Any]) -> None:
        """Set (a value) or clear (None, back to .env) the given fields of one connection."""
        connection = BY_ID.get(connection_id)
        if connection is None or not connection.fields:
            raise KeyError(connection_id)
        known = {field.key: field for field in connection.fields}
        unknown = set(values) - set(known)
        if unknown:
            raise ConnectionSetupError(f"Unknown field: {', '.join(sorted(unknown))}")
        fernet = _fernet(self.base)
        for key, value in values.items():
            if value is None:
                await self.db.rest(
                    "DELETE",
                    "app_connections",
                    params={"connection": f"eq.{connection_id}", "field": f"eq.{key}"},
                )
                continue
            text = _clean(known[key], value)
            await self.db.rest(
                "POST",
                "app_connections",
                params={"on_conflict": "connection,field"},
                json={
                    "connection": connection_id,
                    "field": key,
                    "value_encrypted": fernet.encrypt(text.encode()).decode(),
                    "updated_at": datetime.now(UTC).isoformat(),
                },
                prefer="resolution=merge-duplicates,return=minimal",
            )
        self.last_tests.pop(connection_id, None)
        await self.load()

    async def test(self, connection_id: str, context: dict[str, Any]) -> dict[str, Any]:
        """Runs a live check with the current values; never returns a secret."""
        if connection_id not in BY_ID:
            raise KeyError(connection_id)
        settings = self.effective()
        started = time.perf_counter()
        try:
            message = await _TESTS[connection_id](settings, context)
            ok = True
        except Exception as exc:  # every failure becomes a readable result
            message = _readable(exc, settings)
            ok = False
        result = {
            "ok": ok,
            "message": message,
            "ms": round((time.perf_counter() - started) * 1000),
            "tested_at": datetime.now(UTC).isoformat(),
        }
        self.last_tests[connection_id] = result
        return result


def _readable(exc: Exception, settings: Settings) -> str:
    text = str(exc) or exc.__class__.__name__
    for secret in (settings.anthropic_api_key, settings.openai_api_key, settings.smtp_password):
        if secret:
            text = text.replace(secret, "••••")
    if isinstance(exc, anthropic.AuthenticationError):
        return "Anthropic rejected the API key (invalid or revoked)."
    if isinstance(exc, anthropic.NotFoundError):
        return "The key works, but this account can't use the model set in Admin studio."
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "The email server rejected the username or password."
    if isinstance(exc, ConnectionRefusedError):
        return "Nothing answered at that address and port. Check the server and port."
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
        return "The service took too long to answer. Try again, or check the address."
    if isinstance(exc, OSError | httpx.RequestError) and not isinstance(exc, smtplib.SMTPException):
        return f"Could not reach the service: {text[:200]}"
    return text[:300]


async def _test_anthropic(settings: Settings, context: dict[str, Any]) -> str:
    if not settings.anthropic_api_key:
        raise ConnectionSetupError("No API key is set.")
    model = context.get("model") or "claude-opus-5-5"
    if not str(model).startswith("claude"):
        model = "claude-opus-5-5"
    async with anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key) as client:
        found = await client.models.retrieve(model)
    return f"Key works. {found.display_name} is available."


async def _test_openai(settings: Settings, context: dict[str, Any]) -> str:
    if not settings.openai_api_key:
        raise ConnectionSetupError("No API key is set.")
    model = settings.openai_vision_model
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"https://api.openai.com/v1/models/{model}",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        )
    if response.status_code == 401:
        raise ConnectionSetupError("OpenAI rejected the API key (invalid or revoked).")
    if response.status_code == 404:
        raise ConnectionSetupError(f"The key works, but the model {model} isn't available.")
    response.raise_for_status()
    return f"Key works. {model} is available."


def _smtp_login(settings: Settings) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.noop()


async def _test_email(settings: Settings, context: dict[str, Any]) -> str:
    if not settings.smtp_host or not settings.smtp_from:
        raise ConnectionSetupError("Set the SMTP server and the Send from address.")
    await asyncio.to_thread(_smtp_login, settings)
    signed_in = " and signed in" if settings.smtp_username else ""
    server = f"{settings.smtp_host}:{settings.smtp_port}"
    return f"Connected to {server}{signed_in}. Reminders can be sent."


async def _test_sec(settings: Settings, context: dict[str, Any]) -> str:
    if "@" not in settings.sec_user_agent:
        raise ConnectionSetupError("The contact must include an email address.")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            "https://data.sec.gov/submissions/CIK0000320193.json",
            headers={"User-Agent": settings.sec_user_agent},
        )
    if response.status_code == 403:
        raise ConnectionSetupError("The SEC refused the request; check the contact name and email.")
    response.raise_for_status()
    return "The SEC answered. Company data and report dates can load."


def _stripe_mode(key: str) -> str | None:
    for prefix in ("sk_", "rk_", "pk_"):
        if key.startswith(prefix + "test_"):
            return "test"
        if key.startswith(prefix + "live_"):
            return "live"
    return None


async def _test_stripe(settings: Settings, context: dict[str, Any]) -> str:
    secret = settings.stripe_secret_key
    if not secret:
        raise ConnectionSetupError("No secret key is set.")
    mode = _stripe_mode(secret)
    if mode is None:
        raise ConnectionSetupError("That isn't a Stripe secret key (sk_test_… or sk_live_…).")
    publishable = settings.stripe_publishable_key
    if publishable and not publishable.startswith("pk_"):
        raise ConnectionSetupError("The publishable key should start with pk_test_ or pk_live_.")
    if publishable and _stripe_mode(publishable) != mode:
        raise ConnectionSetupError(
            "The secret and publishable keys are from different modes (test and live)."
        )
    if settings.stripe_webhook_secret and not settings.stripe_webhook_secret.startswith("whsec_"):
        raise ConnectionSetupError("The webhook signing secret should start with whsec_.")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get("https://api.stripe.com/v1/balance", auth=(secret, ""))
    if response.status_code == 401:
        raise ConnectionSetupError("Stripe rejected the secret key (invalid or revoked).")
    if response.status_code == 403:
        raise ConnectionSetupError(
            "This restricted key can't read the balance; allow Balance: Read."
        )
    response.raise_for_status()
    missing = [
        label
        for label, value in (
            ("publishable key", publishable),
            ("webhook signing secret", settings.stripe_webhook_secret),
        )
        if not value
    ]
    note = f" Still to add: {', '.join(missing)}." if missing else ""
    return f"Key works ({mode} mode).{note}"


async def _test_market(settings: Settings, context: dict[str, Any]) -> str:
    market = context["market"]
    start = date.today() - timedelta(days=10)
    history = await asyncio.to_thread(market.close_history, ["SPY"], start)
    closes = history.get("SPY") or []
    if not closes:
        raise ConnectionSetupError("Yahoo Finance returned no prices for SPY.")
    last = closes[-1]
    return f"Prices load. SPY closed at {last['close']:.2f} on {last['date']}."


async def _test_storage(settings: Settings, context: dict[str, Any]) -> str:
    if not await context["gateway"].bucket_exists("education"):
        raise ConnectionSetupError("The education picture bucket is missing; run the migrations.")
    return "The education picture bucket is ready."


_TESTS = {
    "anthropic": _test_anthropic,
    "openai": _test_openai,
    "email": _test_email,
    "stripe": _test_stripe,
    "sec": _test_sec,
    "market": _test_market,
    "storage": _test_storage,
}
