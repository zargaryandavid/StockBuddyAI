import os
from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "StockBuddyAI"
    web_origin: str = "http://localhost:3000"
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    sec_user_agent: str = Field(
        default="",
        description="SEC-compliant identity in the form 'Application email@example.com'",
    )
    hedge_fund_llm_model: str = "gpt-6-sol"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    # Encrypts secrets saved in Admin -> Connections; defaults to one derived from the
    # service role key.
    connections_encryption_key: str = ""
    openai_vision_model: str = "gpt-6-sol"
    # Vercel's disk is read-only except /tmp, which is wiped between instances.
    sec_cache_dir: str = Field(
        default_factory=lambda: "/tmp/stockbuddy/sec" if os.environ.get("VERCEL") else ".cache/sec"
    )
    # On a serverless host (Vercel sets VERCEL=1) nothing runs after a request ends, so a
    # review runs inside its request and reminders come from a scheduled call instead.
    serverless: bool = Field(default_factory=lambda: bool(os.environ.get("VERCEL")))
    # Vercel Cron sends it as a bearer token to /api/cron/reminders.
    cron_secret: str = ""
    admin_email: str = Field(
        default="",
        validation_alias=AliasChoices("ADMIN_LOGIN_EMAIL", "ADIMIN_LOGIN_EMAIL"),
    )
    # Stripe, for buying AI tokens (not live yet). Set in Admin -> Connections.
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    reminder_poll_seconds: int = 900
    admin_password: str = Field(
        default="",
        validation_alias=AliasChoices("ADMIN_LOGIN_PASSWORD", "ADIMIN_LOGIN_PASSWORD"),
    )

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)

    def validate_runtime(self) -> None:
        missing = [
            name
            for name, value in (
                ("SUPABASE_PUBLISHABLE_KEY", self.supabase_publishable_key),
                ("SUPABASE_SERVICE_ROLE_KEY", self.supabase_service_role_key),
                ("SEC_USER_AGENT", self.sec_user_agent),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing required configuration: {', '.join(missing)}")
        if "@" not in self.sec_user_agent:
            raise RuntimeError("SEC_USER_AGENT must include a contact email address")


@lru_cache
def get_settings() -> Settings:
    return Settings()
