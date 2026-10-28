from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx

from stockbuddy.config import Settings

logger = logging.getLogger(__name__)


# Short, so a signed-out or deleted account stops working within half a minute.
IDENTITY_TTL_SECONDS = 30


class SupabaseError(RuntimeError):
    pass


@dataclass(frozen=True)
class Account:
    id: UUID
    email: str
    # Whether the person opened the confirmation email; Admin requires it.
    email_confirmed: bool = True
    # When they confirmed it (ISO time), used to send the welcome email once, right after.
    email_confirmed_at: str | None = None


class SupabaseGateway:
    """Minimal server-side client for Supabase Auth and PostgREST."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._client = client or httpx.AsyncClient(timeout=30)
        self._owns_client = client is None
        self._admin_ready = False
        # Who each recent token belongs to, so a page's burst of requests asks Supabase once.
        self._identities: dict[str, tuple[float, Account]] = {}

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    def is_admin(self, account: Account) -> bool:
        """The configured admin email, and only once that address is confirmed, so a
        sign-up with the admin's address can't reach Admin before its owner confirms."""
        configured = self.settings.admin_email.strip().lower()
        return (
            bool(configured)
            and account.email_confirmed
            and account.email.strip().lower() == configured
        )

    async def authenticate(self, token: str) -> UUID:
        return (await self.identify(token)).id

    async def identify(self, token: str) -> Account:
        now = time.monotonic()
        cached = self._identities.get(token)
        if cached and now - cached[0] < IDENTITY_TTL_SECONDS:
            return cached[1]
        account = await self._fetch_identity(token)
        if len(self._identities) >= 500:
            self._identities.clear()
        self._identities[token] = (now, account)
        return account

    def forget_identity(self, token: str) -> None:
        self._identities.pop(token, None)

    async def _fetch_identity(self, token: str) -> Account:
        response = await self._client.get(
            f"{self.settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": self.settings.supabase_publishable_key,
                "Authorization": f"Bearer {token}",
            },
        )
        if response.status_code != 200:
            raise SupabaseError("Invalid or expired session")
        try:
            body = response.json()
            return Account(
                id=UUID(body["id"]),
                email=str(body.get("email") or ""),
                email_confirmed=bool(body.get("email_confirmed_at")),
                email_confirmed_at=body.get("email_confirmed_at"),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise SupabaseError("Supabase returned an invalid user identity") from exc

    async def ensure_admin_user(self) -> None:
        """Create the configured admin account when it does not exist yet.

        Authorization uses the server-side email allowlist. app_metadata.role is
        recorded for the session, and user-editable metadata is never consulted.
        """
        if self._admin_ready or "PYTEST_CURRENT_TEST" in os.environ:
            return
        email = self.settings.admin_email.strip().lower()
        password = self.settings.admin_password
        if not email or not password or not self.settings.supabase_service_role_key:
            return
        headers = self._service_headers()
        try:
            existing = await self._find_user_by_email(headers, email)
            if existing is None:
                created = await self._client.post(
                    f"{self.settings.supabase_url}/auth/v1/admin/users",
                    headers=headers,
                    json={
                        "email": email,
                        "password": password,
                        "email_confirm": True,
                        "app_metadata": {"role": "admin"},
                    },
                )
                if created.status_code >= 400:
                    existing = await self._find_user_by_email(headers, email)
                    if existing is None:
                        logger.warning("Admin bootstrap failed with status %s", created.status_code)
                        return
            if existing is not None:
                metadata = dict(existing.get("app_metadata") or {})
                if metadata.get("role") != "admin":
                    metadata["role"] = "admin"
                    updated = await self._client.put(
                        f"{self.settings.supabase_url}/auth/v1/admin/users/{existing['id']}",
                        headers=headers,
                        json={"app_metadata": metadata},
                    )
                    if updated.status_code >= 400:
                        logger.warning(
                            "Admin role update failed with status %s", updated.status_code
                        )
                        return
        except (httpx.HTTPError, SupabaseError):
            logger.warning("Admin bootstrap could not reach Supabase")
            return
        self._admin_ready = True

    async def delete_user(self, user_id: UUID) -> None:
        """Deletes a sign-in and, through the database's cascades, all of its data."""
        response = await self._client.delete(
            f"{self.settings.supabase_url}/auth/v1/admin/users/{user_id}",
            headers=self._service_headers(),
        )
        if response.status_code >= 400 and response.status_code != 404:
            raise SupabaseError(f"Could not delete the account ({response.status_code})")

    async def upload_object(
        self, bucket: str, path: str, content: bytes, content_type: str
    ) -> None:
        """Store a file in Supabase Storage with the service role, replacing any old copy."""
        response = await self._client.post(
            f"{self.settings.supabase_url}/storage/v1/object/{bucket}/{path}",
            headers={**self._service_headers(), "Content-Type": content_type, "x-upsert": "true"},
            content=content,
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Storage upload failed: {response.text[:300]}")

    async def delete_object(self, bucket: str, path: str) -> None:
        response = await self._client.request(
            "DELETE",
            f"{self.settings.supabase_url}/storage/v1/object/{bucket}",
            headers=self._service_headers(),
            json={"prefixes": [path]},
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Storage delete failed: {response.text[:300]}")

    async def bucket_exists(self, bucket: str) -> bool:
        response = await self._client.get(
            f"{self.settings.supabase_url}/storage/v1/bucket/{bucket}",
            headers=self._service_headers(),
        )
        return response.status_code == 200

    def public_object_url(self, bucket: str, path: str) -> str:
        return f"{self.settings.supabase_url}/storage/v1/object/public/{bucket}/{path}"

    def _service_headers(self) -> dict[str, str]:
        key = self.settings.supabase_service_role_key
        return {"apikey": key, "Authorization": f"Bearer {key}"}

    async def _find_user_by_email(
        self, headers: dict[str, str], email: str
    ) -> dict[str, Any] | None:
        for page in range(1, 11):
            response = await self._client.get(
                f"{self.settings.supabase_url}/auth/v1/admin/users",
                headers=headers,
                params={"page": str(page), "per_page": "200"},
            )
            if response.status_code >= 400:
                raise SupabaseError("Could not list auth users")
            users = response.json().get("users", [])
            for user in users:
                if str(user.get("email") or "").strip().lower() == email:
                    return user
            if len(users) < 200:
                return None
        return None

    async def rest(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> Any:
        bearer = token or self.settings.supabase_service_role_key
        key = (
            self.settings.supabase_publishable_key
            if token
            else self.settings.supabase_service_role_key
        )
        headers = {"apikey": key, "Authorization": f"Bearer {bearer}"}
        if prefer:
            headers["Prefer"] = prefer
        response = await self._client.request(
            method,
            f"{self.settings.supabase_url}/rest/v1/{path.lstrip('/')}",
            headers=headers,
            params=params,
            json=json,
        )
        if response.status_code >= 400:
            detail = response.text[:500]
            raise SupabaseError(f"Supabase REST {method} {path} failed: {detail}")
        if response.status_code == 204 or not response.content:
            return None
        return response.json()
