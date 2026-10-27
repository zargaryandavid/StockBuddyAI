from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from stockbuddy.controls import (
    IndustrySetting,
    PersonaSetting,
    StudioSettings,
    profiles_for_prompts,
)
from stockbuddy.personas import PERSONAS, builtin_prompts
from stockbuddy.schemas import (
    EducationArticleInput,
    FireAssetInput,
    FireEntryInput,
    FireSettingsInput,
    PortfolioCreate,
    PositionTransaction,
    ProfileInput,
    ReminderCreate,
    WishCreate,
    WishUpdate,
)
from stockbuddy.supabase import SupabaseGateway

_POSITION_SELECT = (
    "ticker,shares,purchase_price,sector,display_order,company_name,asset_type,"
    "industry,investment_category,classification_source,quote_currency,"
    "lifecycle_phase,lifecycle_evidence,lifecycle_updated_at,report_date,"
    "report_source,notes"
)

_REMINDER_SELECT = (
    "id,portfolio_id,ticker,company_name,last_report_date,remind_on,status,sent_at,created_at"
)
_FIRE_ENTRY_SELECT = (
    "id,kind,category,name,amount,currency,frequency,starts_on,ends_on,principal,"
    "yield_pct,quantity,unit_price,note,asset_id,created_at,updated_at"
)

_WISH_SELECT = "id,list,text,done,position,created_at,updated_at"

_ARTICLE_SELECT = "id,title,body,image_path,published,position,created_at,updated_at"
_ARTICLE_ORDER = "position.asc,created_at.desc"

_FIRE_ASSET_SELECT = "id,asset_type,name,market_value,currency,location,note,created_at,updated_at"


class Repository:
    def __init__(self, db: SupabaseGateway) -> None:
        self.db = db

    async def create_portfolio(self, token: str, payload: PortfolioCreate) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "rpc/create_portfolio",
            token=token,
            json=_portfolio_rpc_payload(payload),
        )
        row = rows[0] if isinstance(rows, list) else rows
        return await self._save_other_cash(token, row, payload)

    async def update_portfolio(
        self, token: str, portfolio_id: UUID, payload: PortfolioCreate
    ) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "POST",
            "rpc/update_portfolio",
            token=token,
            json={"target_id": str(portfolio_id), **_portfolio_rpc_payload(payload)},
        )
        row = rows[0] if isinstance(rows, list) and rows else None
        return await self._save_other_cash(token, row, payload) if row else None

    async def _save_other_cash(
        self, token: str, row: dict[str, Any], payload: PortfolioCreate
    ) -> dict[str, Any]:
        """Cash in other currencies is kept beside the portfolio, saved as the owner."""
        other_cash = [
            item.model_dump(mode="json")
            for item in payload.other_cash
            if item.currency != payload.base_currency
        ]
        if not isinstance(row, dict) or "id" not in row:
            return row
        if other_cash or row.get("other_cash"):
            await self.db.rest(
                "PATCH",
                "portfolios",
                token=token,
                params={"id": f"eq.{row['id']}"},
                json={"other_cash": other_cash},
                prefer="return=minimal",
            )
        return {**row, "other_cash": other_cash}

    async def delete_portfolio(self, token: str, portfolio_id: UUID) -> bool:
        rows = await self.db.rest(
            "DELETE",
            "portfolios",
            token=token,
            params={"id": f"eq.{portfolio_id}"},
            prefer="return=representation",
        )
        return bool(rows)

    async def apply_transaction(
        self,
        token: str,
        portfolio_id: UUID,
        transaction: PositionTransaction,
    ) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "rpc/apply_portfolio_transaction",
            token=token,
            json={
                "target_portfolio_id": str(portfolio_id),
                "transaction_ticker": transaction.ticker,
                "transaction_kind": transaction.kind,
                "transaction_quantity": transaction.quantity,
                "transaction_price": transaction.price,
                "transaction_transacted_at": transaction.transacted_at.isoformat(),
            },
        )
        return rows[0] if isinstance(rows, list) else rows

    async def list_transactions(
        self,
        token: str,
        portfolio_id: UUID,
    ) -> list[dict[str, Any]]:
        return await self.db.rest(
            "GET",
            "portfolio_transactions",
            token=token,
            params={
                "portfolio_id": f"eq.{portfolio_id}",
                "select": "id,portfolio_id,ticker,kind,quantity,price,transacted_at,created_at",
                "order": "transacted_at.desc,created_at.desc",
            },
        )

    async def create_reminder(
        self, token: str, user_id: UUID, reminder: ReminderCreate
    ) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "report_reminders",
            token=token,
            json={
                "user_id": str(user_id),
                **reminder.model_dump(mode="json", exclude_none=True),
            },
            prefer="return=representation",
        )
        return rows[0]

    async def list_reminders(self, token: str) -> list[dict[str, Any]]:
        return await self.db.rest(
            "GET",
            "report_reminders",
            token=token,
            params={
                "select": _REMINDER_SELECT,
                "order": "remind_on.asc",
            },
        )

    async def delete_reminder(self, token: str, reminder_id: UUID) -> bool:
        rows = await self.db.rest(
            "DELETE",
            "report_reminders",
            token=token,
            params={"id": f"eq.{reminder_id}"},
            prefer="return=representation",
        )
        return bool(rows)

    async def due_reminders(self, today: str) -> list[dict[str, Any]]:
        return await self.db.rest(
            "GET",
            "report_reminders",
            params={
                "select": f"{_REMINDER_SELECT},email",
                "status": "eq.pending",
                "remind_on": f"lte.{today}",
                "order": "remind_on.asc",
                "limit": "100",
            },
        )

    async def mark_reminder(
        self, reminder_id: str, status: str, *, error: str | None = None
    ) -> None:
        payload: dict[str, Any] = {"status": status, "error": error}
        if status == "sent":
            payload["sent_at"] = datetime.now(UTC).isoformat()
        await self.db.rest(
            "PATCH",
            "report_reminders",
            params={"id": f"eq.{reminder_id}"},
            json=payload,
            prefer="return=minimal",
        )

    async def list_fire_entries(self, token: str) -> list[dict[str, Any]]:
        return await self.db.rest(
            "GET",
            "fire_entries",
            token=token,
            params={"select": _FIRE_ENTRY_SELECT, "order": "kind.asc,starts_on.asc"},
        )

    async def _entry_payload(
        self, token: str, user_id: UUID, entry: FireEntryInput
    ) -> dict[str, Any]:
        """Entry columns, creating the new asset first when the entry asks for one."""
        payload = entry.model_dump(mode="json", exclude={"new_asset"})
        if entry.new_asset is not None:
            asset = await self.create_fire_asset(token, user_id, entry.new_asset)
            payload["asset_id"] = asset["id"]
        return payload

    async def create_fire_entry(
        self, token: str, user_id: UUID, entry: FireEntryInput
    ) -> dict[str, Any]:
        payload = await self._entry_payload(token, user_id, entry)
        rows = await self.db.rest(
            "POST",
            "fire_entries",
            token=token,
            json={"user_id": str(user_id), **payload},
            prefer="return=representation",
        )
        return rows[0]

    async def update_fire_entry(
        self, token: str, user_id: UUID, entry_id: UUID, entry: FireEntryInput
    ) -> dict[str, Any] | None:
        payload = await self._entry_payload(token, user_id, entry)
        rows = await self.db.rest(
            "PATCH",
            "fire_entries",
            token=token,
            params={"id": f"eq.{entry_id}"},
            json={**payload, "updated_at": datetime.now(UTC).isoformat()},
            prefer="return=representation",
        )
        return rows[0] if rows else None

    async def list_fire_assets(self, token: str) -> list[dict[str, Any]]:
        return await self.db.rest(
            "GET",
            "fire_assets",
            token=token,
            params={"select": _FIRE_ASSET_SELECT, "order": "created_at.asc"},
        )

    async def create_fire_asset(
        self, token: str, user_id: UUID, asset: FireAssetInput
    ) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "fire_assets",
            token=token,
            json={"user_id": str(user_id), **asset.model_dump(mode="json")},
            prefer="return=representation",
        )
        return rows[0]

    async def update_fire_asset(
        self, token: str, asset_id: UUID, asset: FireAssetInput
    ) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "PATCH",
            "fire_assets",
            token=token,
            params={"id": f"eq.{asset_id}"},
            json={**asset.model_dump(mode="json"), "updated_at": datetime.now(UTC).isoformat()},
            prefer="return=representation",
        )
        return rows[0] if rows else None

    async def delete_fire_asset(self, token: str, asset_id: UUID) -> bool:
        rows = await self.db.rest(
            "DELETE",
            "fire_assets",
            token=token,
            params={"id": f"eq.{asset_id}"},
            prefer="return=representation",
        )
        return bool(rows)

    async def delete_fire_entry(self, token: str, entry_id: UUID) -> bool:
        rows = await self.db.rest(
            "DELETE",
            "fire_entries",
            token=token,
            params={"id": f"eq.{entry_id}"},
            prefer="return=representation",
        )
        return bool(rows)

    async def get_fire_settings(self, token: str) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "GET",
            "fire_settings",
            token=token,
            # "*" keeps loading working when a newer setting column is not migrated yet.
            params={"select": "*", "limit": "1"},
        )
        return rows[0] if rows else None

    async def save_fire_settings(
        self, token: str, user_id: UUID, settings: FireSettingsInput
    ) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "fire_settings",
            token=token,
            params={"on_conflict": "user_id"},
            json={
                "user_id": str(user_id),
                **settings.model_dump(mode="json"),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            prefer="resolution=merge-duplicates,return=representation",
        )
        return rows[0]

    async def get_profile(self, token: str) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "GET",
            "user_profiles",
            token=token,
            params={"select": "date_of_birth,display_name", "limit": "1"},
        )
        return rows[0] if rows else None

    async def save_profile(
        self, token: str, user_id: UUID, profile: ProfileInput
    ) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "user_profiles",
            token=token,
            params={"on_conflict": "user_id"},
            json={
                "user_id": str(user_id),
                **profile.model_dump(mode="json"),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            prefer="resolution=merge-duplicates,return=representation",
        )
        return {"date_of_birth": rows[0].get("date_of_birth")}

    async def list_portfolios(self, token: str) -> list[dict[str, Any]]:
        return await self.db.rest(
            "GET",
            "portfolios",
            token=token,
            params={
                "select": (f"*,portfolio_positions({_POSITION_SELECT})"),
                "portfolio_positions.order": "display_order.asc",
                "order": "created_at.desc",
            },
        )

    async def get_portfolio(self, portfolio_id: UUID, user_id: UUID) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "GET",
            "portfolios",
            params={
                "id": f"eq.{portfolio_id}",
                "user_id": f"eq.{user_id}",
                "select": (f"*,portfolio_positions({_POSITION_SELECT})"),
                "portfolio_positions.order": "display_order.asc",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def create_run(
        self, user_id: UUID, portfolio_id: UUID, ticker: str, as_of: str
    ) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "analysis_runs",
            json={
                "user_id": str(user_id),
                "portfolio_id": str(portfolio_id),
                "ticker": ticker,
                "as_of": as_of,
                "status": "pending",
            },
            prefer="return=representation",
        )
        return rows[0]

    async def set_run_status(self, run_id: UUID, status: str, *, error: str | None = None) -> None:
        payload: dict[str, Any] = {"status": status, "error": error}
        if status in {"completed", "failed"}:
            payload["completed_at"] = datetime.now(UTC).isoformat()
        await self.db.rest(
            "PATCH",
            "analysis_runs",
            params={"id": f"eq.{run_id}"},
            json=payload,
        )

    async def save_report(
        self,
        run_id: UUID,
        decision: dict[str, Any],
        signals: list[dict[str, Any]],
        recommendation: dict[str, Any],
    ) -> None:
        await self.db.rest(
            "PATCH",
            "analysis_runs",
            params={"id": f"eq.{run_id}"},
            json={"decision": decision},
        )
        if signals:
            await self.db.rest("POST", "analysis_signals", json=signals)
        await self.db.rest("POST", "recommendations", json=recommendation)
        await self.set_run_status(run_id, "completed")

    async def get_run(self, run_id: UUID, user_id: UUID) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "GET",
            "analysis_runs",
            params={
                "id": f"eq.{run_id}",
                "user_id": f"eq.{user_id}",
                "select": (
                    "id,portfolio_id,ticker,as_of,status,error,created_at,completed_at,"
                    "analysis_signals(strategy,persona,ticker,signal,confidence,value,"
                    "reasoning,abstained),"
                    "recommendations(ticker,label,current_weight,target_weight,"
                    "delta_shares,mark)"
                ),
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def list_wishes(self, token: str, wish_list: str | None = None) -> list[dict[str, Any]]:
        params = {"select": _WISH_SELECT, "order": "position.asc,created_at.asc"}
        if wish_list:
            params["list"] = f"eq.{wish_list}"
        return await self.db.rest("GET", "wishes", token=token, params=params)

    async def create_wish(self, token: str, user_id: UUID, wish: WishCreate) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "wishes",
            token=token,
            params={"select": _WISH_SELECT},
            json={"user_id": str(user_id), **wish.model_dump(mode="json")},
            prefer="return=representation",
        )
        return rows[0]

    async def update_wish(
        self, token: str, wish_id: UUID, wish: WishUpdate
    ) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "PATCH",
            "wishes",
            token=token,
            params={"id": f"eq.{wish_id}", "select": _WISH_SELECT},
            json={
                **wish.model_dump(mode="json", exclude_none=True),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            prefer="return=representation",
        )
        return rows[0] if rows else None

    async def reorder_wishes(self, token: str, wish_list: str, ids: list[UUID]) -> int:
        return await self.db.rest(
            "POST",
            "rpc/reorder_wishes",
            token=token,
            json={"target_list": wish_list, "wish_ids": [str(item) for item in ids]},
        )

    async def delete_wish(self, token: str, wish_id: UUID) -> bool:
        rows = await self.db.rest(
            "DELETE",
            "wishes",
            token=token,
            params={"id": f"eq.{wish_id}"},
            prefer="return=representation",
        )
        return bool(rows)

    async def use_ai_feature(self, token: str, feature: str, daily_limit: int) -> bool:
        """Counts one use of an AI feature for the caller; False when over today's limit."""
        return bool(
            await self.db.rest(
                "POST",
                "rpc/use_ai_feature",
                token=token,
                json={"feature_name": feature, "daily_limit": daily_limit},
            )
        )

    async def ai_usage_today(self, token: str) -> dict[str, int]:
        """The caller's AI uses in each feature's current period (a month for review
        tokens, a day for the rest), as the database counts them."""
        today = datetime.now(UTC).date()
        rows = await self.db.rest(
            "GET",
            "ai_usage",
            token=token,
            params={
                "select": "feature,day,count",
                "day": f"in.({today.replace(day=1).isoformat()},{today.isoformat()})",
            },
        )
        return {
            row["feature"]: int(row["count"])
            for row in rows or []
            if row["day"] == ai_usage_period(row["feature"], today)[0].isoformat()
        }

    async def reset_ai_usage_today(self, user_id: UUID) -> int:
        """Admin testing aid: clears one person's AI uses in the current periods (this
        month's review tokens and today's other uses). Returns rows removed."""
        today = datetime.now(UTC).date()
        rows = await self.db.rest(
            "DELETE",
            "ai_usage",
            params={
                "user_id": f"eq.{user_id}",
                "day": f"in.({today.replace(day=1).isoformat()},{today.isoformat()})",
            },
            prefer="return=representation",
        )
        return len(rows or [])

    async def list_share_links(self, token: str) -> list[dict[str, Any]]:
        return await self.db.rest(
            "GET",
            "share_links",
            token=token,
            params={"select": "token,kind,portfolio_id,created_at", "order": "created_at.asc"},
        )

    async def create_share_link(
        self, token: str, user_id: UUID, share_token: str, kind: str, portfolio_id: UUID | None
    ) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "share_links",
            token=token,
            params={"select": "token,kind,portfolio_id,created_at"},
            json={
                "token": share_token,
                "user_id": str(user_id),
                "kind": kind,
                "portfolio_id": str(portfolio_id) if portfolio_id else None,
            },
            prefer="return=representation",
        )
        return rows[0]

    async def delete_share_link(self, token: str, share_token: str) -> bool:
        rows = await self.db.rest(
            "DELETE",
            "share_links",
            token=token,
            params={"token": f"eq.{share_token}"},
            prefer="return=representation",
        )
        return bool(rows)

    async def find_share_link(self, share_token: str) -> dict[str, Any] | None:
        """Service role: the link for a public visitor, who is not signed in."""
        rows = await self.db.rest(
            "GET",
            "share_links",
            params={
                "token": f"eq.{share_token}",
                "select": "user_id,kind,portfolio_id",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def shared_owner_data(self, user_id: UUID) -> dict[str, Any]:
        """Service role, for one owner only: what a FIRE share link shows."""
        owner = {"user_id": f"eq.{user_id}"}
        entries = await self.db.rest(
            "GET",
            "fire_entries",
            params={**owner, "select": _FIRE_ENTRY_SELECT, "order": "kind.asc,starts_on.asc"},
        )
        settings = await self.db.rest(
            "GET", "fire_settings", params={**owner, "select": "*", "limit": "1"}
        )
        assets = await self.db.rest(
            "GET",
            "fire_assets",
            params={**owner, "select": _FIRE_ASSET_SELECT, "order": "created_at.asc"},
        )
        return {
            "entries": entries,
            "settings": settings[0] if settings else {},
            "assets": assets,
        }

    async def shared_owner_name(self, user_id: UUID) -> str | None:
        rows = await self.db.rest(
            "GET",
            "user_profiles",
            params={"user_id": f"eq.{user_id}", "select": "display_name", "limit": "1"},
        )
        return rows[0].get("display_name") if rows else None

    async def list_published_articles(self, token: str) -> list[dict[str, Any]]:
        """Articles a signed-in user may read; row-level security keeps drafts out."""
        return await self.db.rest(
            "GET",
            "education_articles",
            token=token,
            params={"select": _ARTICLE_SELECT, "order": _ARTICLE_ORDER},
        )

    async def list_all_articles(self) -> list[dict[str, Any]]:
        return await self.db.rest(
            "GET",
            "education_articles",
            params={"select": _ARTICLE_SELECT, "order": _ARTICLE_ORDER},
        )

    async def get_article(self, article_id: UUID) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "GET",
            "education_articles",
            params={"select": _ARTICLE_SELECT, "id": f"eq.{article_id}", "limit": "1"},
        )
        return rows[0] if rows else None

    async def create_article(self, article: EducationArticleInput) -> dict[str, Any]:
        rows = await self.db.rest(
            "POST",
            "education_articles",
            json=article.model_dump(mode="json"),
            prefer="return=representation",
        )
        return rows[0]

    async def update_article(
        self, article_id: UUID, article: EducationArticleInput
    ) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "PATCH",
            "education_articles",
            params={"id": f"eq.{article_id}"},
            json={**article.model_dump(mode="json"), "updated_at": datetime.now(UTC).isoformat()},
            prefer="return=representation",
        )
        return rows[0] if rows else None

    async def delete_article(self, article_id: UUID) -> dict[str, Any] | None:
        rows = await self.db.rest(
            "DELETE",
            "education_articles",
            params={"id": f"eq.{article_id}"},
            prefer="return=representation",
        )
        return rows[0] if rows else None

    async def load_settings(self) -> StudioSettings:
        defaults = builtin_prompts()
        settings_rows = await self.db.rest(
            "GET",
            "app_settings",
            params={"id": "eq.1", "select": "*", "limit": "1"},
        )
        if not settings_rows:
            raise RuntimeError("Studio settings have not been migrated")
        prompt_rows = await self.db.rest(
            "GET",
            "persona_prompts",
            params={"select": "persona,display_name,strategy,prompt"},
        )
        stored = {row["persona"] for row in prompt_rows}
        missing = [persona for persona in PERSONAS if persona.persona not in stored]
        if missing:
            await self.db.rest(
                "POST",
                "persona_prompts",
                json=[
                    {
                        "persona": persona.persona,
                        "display_name": persona.display_name,
                        "strategy": persona.strategy,
                        "prompt": defaults[persona.persona],
                    }
                    for persona in missing
                ],
                prefer="return=minimal",
            )
            prompt_rows = await self.db.rest(
                "GET",
                "persona_prompts",
                params={"select": "persona,display_name,strategy,prompt"},
            )
        industry_rows = await self.db.rest(
            "GET",
            "industries",
            params={"select": "name,icon,sort_order", "order": "sort_order"},
        )
        row = settings_rows[0]
        industries = tuple(
            IndustrySetting(
                name=item["name"],
                icon=item["icon"],
                sort_order=int(item["sort_order"]),
            )
            for item in industry_rows
        )
        return StudioSettings(
            max_position_pct=float(row["max_position_pct"]),
            max_industry_pct=float(row.get("max_industry_pct", 0.25)),
            deep_value_weight=float(row["deep_value_weight"]),
            trajectory_weight=float(row["trajectory_weight"]),
            llm_model=row["llm_model"],
            use_transaction_history_analytics=bool(
                row.get("use_transaction_history_analytics", True)
            ),
            min_cash_pct=float(row.get("min_cash_pct", 0.05)),
            daily_wish_checks=int(row.get("daily_wish_checks", 100)),
            daily_screenshot_imports=int(row.get("daily_screenshot_imports", 20)),
            daily_ai_reviews=int(row.get("daily_ai_reviews", 10)),
            industries=industries,
            personas=profiles_for_prompts(prompt_rows, defaults),
        )

    async def save_settings(self, settings: StudioSettings) -> StudioSettings:
        await self.db.rest(
            "PATCH",
            "app_settings",
            params={"id": "eq.1"},
            json={
                "max_position_pct": f"{settings.max_position_pct:.4f}",
                "max_industry_pct": f"{settings.max_industry_pct:.4f}",
                "deep_value_weight": f"{settings.deep_value_weight:.4f}",
                "trajectory_weight": f"{settings.trajectory_weight:.4f}",
                "llm_model": settings.llm_model,
                "use_transaction_history_analytics": (settings.use_transaction_history_analytics),
                "min_cash_pct": f"{settings.min_cash_pct:.4f}",
                "daily_wish_checks": settings.daily_wish_checks,
                "daily_screenshot_imports": settings.daily_screenshot_imports,
                "daily_ai_reviews": settings.daily_ai_reviews,
            },
            prefer="return=minimal",
        )
        await self.db.rest(
            "POST",
            "persona_prompts",
            params={"on_conflict": "persona"},
            json=[_prompt_row(persona) for persona in settings.personas],
            prefer="resolution=merge-duplicates,return=minimal",
        )
        existing_industries = await self.db.rest(
            "GET",
            "industries",
            params={"select": "name"},
        )
        saved_names = {industry.name for industry in settings.industries}
        for existing in existing_industries:
            if existing["name"] not in saved_names:
                await self.db.rest(
                    "DELETE",
                    "industries",
                    params={"name": f"eq.{existing['name']}"},
                    prefer="return=minimal",
                )
        await self.db.rest(
            "POST",
            "industries",
            params={"on_conflict": "name"},
            json=[
                {
                    "name": industry.name,
                    "icon": industry.icon,
                    "sort_order": industry.sort_order,
                }
                for industry in settings.industries
            ],
            prefer="resolution=merge-duplicates,return=minimal",
        )
        return await self.load_settings()


def _prompt_row(persona: PersonaSetting) -> dict[str, str]:
    return {
        "persona": persona.persona,
        "display_name": persona.display_name,
        "strategy": persona.strategy,
        "prompt": persona.prompt,
    }


def _portfolio_rpc_payload(payload: PortfolioCreate) -> dict[str, Any]:
    return {
        "portfolio_name": payload.name,
        "portfolio_cash": payload.cash,
        "portfolio_base_currency": payload.base_currency,
        "portfolio_benchmark": payload.benchmark,
        "portfolio_max_position_pct": payload.max_position_pct,
        "portfolio_max_sector_pct": payload.max_sector_pct,
        "portfolio_min_cash_pct": payload.min_cash_pct,
        "portfolio_time_horizon": payload.time_horizon,
        "portfolio_rebalancing_threshold_pct": payload.rebalancing_threshold_pct,
        "portfolio_positions": [
            {
                **position.model_dump(mode="json"),
                "display_order": (
                    position.display_order if position.display_order is not None else index
                ),
            }
            for index, position in enumerate(payload.positions)
        ],
    }


# Ask Buddy review tokens are a monthly allowance; the other AI features count per day.
# Matches public.ai_usage_period_start in the database.
MONTHLY_AI_FEATURES = frozenset({"ai_review"})


def ai_usage_period(feature: str, today: date | None = None) -> tuple[date, date]:
    """The (UTC) start of the feature's current usage period and the day it resets."""
    today = today or datetime.now(UTC).date()
    if feature in MONTHLY_AI_FEATURES:
        start = today.replace(day=1)
        resets = (start + timedelta(days=32)).replace(day=1)
        return start, resets
    return today, today + timedelta(days=1)
