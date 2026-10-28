from __future__ import annotations

import asyncio
import hmac
import logging
import os
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import anthropic
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from stockbuddy.analysis import AnalysisService, review_models
from stockbuddy.books import router as books_router
from stockbuddy.config import get_settings
from stockbuddy.connections import ConnectionSetupError, ConnectionsService
from stockbuddy.controls import normalize_settings
from stockbuddy.market import SecurityNotFoundError, SecurityOverviewService
from stockbuddy.net_worth import router as net_worth_router
from stockbuddy.personas import builtin_prompts
from stockbuddy.portfolio_image import PortfolioImageError, PortfolioImageExtractor
from stockbuddy.providers import EdgarClient, YahooPriceClient, YahooPriceError
from stockbuddy.reminders import ReminderService
from stockbuddy.repository import MONTHLY_AI_FEATURES, Repository, ai_usage_period
from stockbuddy.schemas import (
    AnalysisCreate,
    ConnectionUpdate,
    EducationArticleInput,
    FireAssetInput,
    FireEntryInput,
    FireSettingsInput,
    PortfolioCreate,
    PositionInput,
    PositionTransaction,
    ProfileInput,
    ReminderCreate,
    ResolveBatch,
    ShareLinkCreate,
    StudioUpdate,
    WishCheck,
    WishCreate,
    WishOrder,
    WishUpdate,
)
from stockbuddy.sharing import ShareService, new_token
from stockbuddy.supabase import Account, SupabaseError, SupabaseGateway
from stockbuddy.wishes import WishMatcher

logger = logging.getLogger(__name__)


def latest_review_date() -> date:
    """The newest close the AI review accepts: yesterday in New York."""
    return datetime.now(ZoneInfo("America/New_York")).date() - timedelta(days=1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    gateway = SupabaseGateway(settings)
    repository = Repository(gateway)
    app.state.gateway = gateway
    app.state.repository = repository
    app.state.connections = ConnectionsService(settings, gateway)
    app.state.wish_matcher = None
    if "PYTEST_CURRENT_TEST" not in os.environ:
        await app.state.connections.load()
    await apply_connections(app)
    await gateway.ensure_admin_user()
    reminder_task = None
    if "PYTEST_CURRENT_TEST" not in os.environ and not settings.serverless:
        reminder_task = asyncio.create_task(_deliver_reminders(app))
    yield
    if reminder_task:
        reminder_task.cancel()
        with suppress(asyncio.CancelledError):
            await reminder_task
    await _close_wish_client(app)
    await gateway.close()


async def _close_wish_client(app: FastAPI) -> None:
    matcher = getattr(app.state, "wish_matcher", None)
    if matcher is not None and matcher.client is not None:
        await matcher.client.close()


async def apply_connections(app: FastAPI) -> None:
    """Rebuilds the services that use outside connections from the current settings.

    Runs at startup and after an admin saves a connection, so changes apply at once.
    """
    settings = app.state.connections.effective()
    repository = app.state.repository
    app.state.settings = settings
    # The AI review library reads its provider keys from the environment.
    for name, value in (
        ("ANTHROPIC_API_KEY", settings.anthropic_api_key),
        ("OPENAI_API_KEY", settings.openai_api_key),
    ):
        if value:
            os.environ[name] = value
        else:
            os.environ.pop(name, None)
    app.state.analysis = AnalysisService(
        settings, repository, load_settings=repository.load_settings
    )
    app.state.market = SecurityOverviewService(
        EdgarClient(settings.sec_user_agent, cache_dir=settings.sec_cache_dir),
        YahooPriceClient(),
    )
    app.state.reminders = ReminderService(settings, repository)
    app.state.shares = ShareService(repository, app.state.market)
    await _close_wish_client(app)
    app.state.wish_matcher = WishMatcher(
        anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        if settings.anthropic_api_key
        else None
    )


async def _deliver_reminders(app: FastAPI) -> None:
    """Sends due reminders on a timer; picks up email settings changed in Admin."""
    while True:
        try:
            await app.state.reminders.send_due()
        except Exception:  # keep the loop alive across transient failures
            logger.exception("Reminder delivery pass failed")
        await asyncio.sleep(app.state.settings.reminder_poll_seconds)


app = FastAPI(title="StockBuddyAI API", version="0.1.0", lifespan=lifespan)
app.include_router(net_worth_router)
app.include_router(books_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().web_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """The API only returns JSON: never sniff it as another type or show it in a frame."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    return authorization.removeprefix("Bearer ").strip()


def _public_settings(settings) -> dict:
    return {
        "max_position_pct": settings.max_position_pct,
        "max_industry_pct": settings.max_industry_pct,
        "deep_value_weight": settings.deep_value_weight,
        "trajectory_weight": settings.trajectory_weight,
        "llm_model": settings.llm_model,
        "use_transaction_history_analytics": settings.use_transaction_history_analytics,
        "min_cash_pct": settings.min_cash_pct,
        "amazon_affiliate_tag": settings.amazon_affiliate_tag,
        "daily_wish_checks": settings.daily_wish_checks,
        "daily_screenshot_imports": settings.daily_screenshot_imports,
        "daily_ai_reviews": settings.daily_ai_reviews,
        "industries": [
            {"name": industry.name, "icon": industry.icon} for industry in settings.industries
        ],
    }


def _studio_payload(settings) -> dict:
    return {
        **_public_settings(settings),
        "personas": [
            {
                "persona": persona.persona,
                "display_name": persona.display_name,
                "strategy": persona.strategy,
                "prompt": persona.prompt,
                "default_prompt": persona.default_prompt,
            }
            for persona in settings.personas
        ],
        "models": review_models(),
    }


async def current_account(
    request: Request, token: Annotated[str, Depends(bearer_token)]
) -> Account:
    try:
        return await request.app.state.gateway.identify(token)
    except SupabaseError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


async def current_user(request: Request, token: Annotated[str, Depends(bearer_token)]) -> UUID:
    try:
        return await request.app.state.gateway.authenticate(token)
    except SupabaseError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


async def require_admin(
    request: Request, account: Annotated[Account, Depends(current_account)]
) -> Account:
    if not request.app.state.gateway.is_admin(account):
        raise HTTPException(status_code=403, detail="Admin access required")
    return account


class AccountDeletion(BaseModel):
    confirm: str


@app.delete("/api/account", status_code=204)
async def delete_my_account(
    payload: AccountDeletion,
    request: Request,
    account: Annotated[Account, Depends(current_account)],
    token: Annotated[str, Depends(bearer_token)],
):
    """Deletes the signed-in person's account and every record that belongs to it."""
    if payload.confirm.strip().lower() != "delete":
        raise HTTPException(status_code=422, detail='Type "delete" to confirm')
    if request.app.state.gateway.is_admin(account):
        raise HTTPException(
            status_code=403,
            detail="The admin account can't be deleted here. Change ADMIN_LOGIN_EMAIL first.",
        )
    try:
        await request.app.state.gateway.delete_user(account.id)
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    forget = getattr(request.app.state.gateway, "forget_identity", None)
    if forget:
        forget(token)
    return Response(status_code=204)


@app.get("/api/me")
async def me(request: Request, account: Annotated[Account, Depends(current_account)]):
    role = "admin" if request.app.state.gateway.is_admin(account) else "user"
    return {"email": account.email, "role": role}


@app.get("/api/settings")
async def public_settings(request: Request, _account: Annotated[Account, Depends(current_account)]):
    settings = await request.app.state.repository.load_settings()
    return {
        **_public_settings(settings),
        "email_reminders_enabled": request.app.state.settings.email_enabled,
    }


FIRE_DEFAULTS = FireSettingsInput().model_dump()


@app.get("/api/fire/entries")
async def list_fire_entries(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.list_fire_entries(token)


@app.post("/api/fire/entries", status_code=201)
async def create_fire_entry(
    entry: FireEntryInput,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.create_fire_entry(token, user_id, entry)


@app.put("/api/fire/entries/{entry_id}")
async def update_fire_entry(
    entry_id: UUID,
    entry: FireEntryInput,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    updated = await request.app.state.repository.update_fire_entry(token, user_id, entry_id, entry)
    if updated is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    return updated


@app.delete("/api/fire/entries/{entry_id}", status_code=204)
async def delete_fire_entry(
    entry_id: UUID,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    if not await request.app.state.repository.delete_fire_entry(token, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    return Response(status_code=204)


@app.get("/api/fire/assets")
async def list_fire_assets(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.list_fire_assets(token)


@app.post("/api/fire/assets", status_code=201)
async def create_fire_asset(
    asset: FireAssetInput,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.create_fire_asset(token, user_id, asset)


@app.put("/api/fire/assets/{asset_id}")
async def update_fire_asset(
    asset_id: UUID,
    asset: FireAssetInput,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    updated = await request.app.state.repository.update_fire_asset(token, asset_id, asset)
    if updated is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return updated


@app.delete("/api/fire/assets/{asset_id}", status_code=204)
async def delete_fire_asset(
    asset_id: UUID,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    if not await request.app.state.repository.delete_fire_asset(token, asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    return Response(status_code=204)


@app.get("/api/fire/settings")
async def get_fire_settings(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    saved = await request.app.state.repository.get_fire_settings(token) or {}
    return {**FIRE_DEFAULTS, **{key: saved[key] for key in FIRE_DEFAULTS if key in saved}}


@app.put("/api/fire/settings")
async def save_fire_settings(
    settings: FireSettingsInput,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.save_fire_settings(token, user_id, settings)


@app.get("/api/profile")
async def get_profile(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    saved = await request.app.state.repository.get_profile(token) or {}
    return {
        "date_of_birth": saved.get("date_of_birth"),
        "display_name": saved.get("display_name"),
    }


@app.put("/api/profile")
async def save_profile(
    profile: ProfileInput,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.save_profile(token, user_id, profile)


@app.get("/api/reminders")
async def list_reminders(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.list_reminders(token)


@app.post("/api/reminders", status_code=201)
async def create_reminder(
    reminder: ReminderCreate,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    try:
        return await request.app.state.repository.create_reminder(token, user_id, reminder)
    except SupabaseError as exc:
        if "duplicate key" in str(exc) or "23505" in str(exc):
            raise HTTPException(
                status_code=409,
                detail=f"A reminder for {reminder.ticker} on {reminder.remind_on} already exists",
            ) from exc
        raise


@app.delete("/api/reminders/{reminder_id}", status_code=204)
async def delete_reminder(
    reminder_id: UUID,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    if not await request.app.state.repository.delete_reminder(token, reminder_id):
        raise HTTPException(status_code=404, detail="Reminder not found")
    return Response(status_code=204)


@app.get("/api/admin/config")
async def admin_config(request: Request, _account: Annotated[Account, Depends(require_admin)]):
    return _studio_payload(await request.app.state.repository.load_settings())


@app.put("/api/admin/config")
async def update_admin_config(
    payload: StudioUpdate,
    request: Request,
    _account: Annotated[Account, Depends(require_admin)],
):
    affiliate_tag = payload.amazon_affiliate_tag
    if affiliate_tag is None:
        affiliate_tag = (await request.app.state.repository.load_settings()).amazon_affiliate_tag
    try:
        settings = normalize_settings(
            max_position_pct=payload.max_position_pct,
            max_industry_pct=payload.max_industry_pct,
            deep_value_weight=payload.deep_value_weight,
            llm_model=payload.llm_model,
            use_transaction_history_analytics=payload.use_transaction_history_analytics,
            min_cash_pct=payload.min_cash_pct,
            amazon_affiliate_tag=affiliate_tag,
            daily_wish_checks=payload.daily_wish_checks,
            daily_screenshot_imports=payload.daily_screenshot_imports,
            daily_ai_reviews=payload.daily_ai_reviews,
            prompts={item.persona: item.prompt for item in payload.prompts},
            defaults=builtin_prompts(),
            industries=[(item.name, item.icon) for item in payload.industries],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    saved = await request.app.state.repository.save_settings(settings)
    # A new review model may need a different key; check again on the next review.
    forget = getattr(request.app.state.analysis, "forget_key_check", None)
    if forget:
        forget()
    return _studio_payload(saved)


AI_LIMIT_MESSAGES = {
    "screenshot_import": (
        "You've used today's screenshot imports. Try again tomorrow, or add holdings by hand."
    ),
    "ai_review": "You've used this month's Ask Buddy tokens. They reset on the 1st.",
}


async def _use_ai(request: Request, token: str, feature: str) -> bool:
    """Counts one use of an AI feature against today's limit set in Admin studio."""
    studio = await request.app.state.repository.load_settings()
    return await request.app.state.repository.use_ai_feature(
        token, feature, studio.daily_limit(feature)
    )


async def _require_ai(request: Request, token: str, feature: str) -> None:
    if not await _use_ai(request, token, feature):
        raise HTTPException(status_code=429, detail=AI_LIMIT_MESSAGES[feature])


def _wish_conflict(exc: SupabaseError) -> HTTPException | None:
    """Database rules for wishes, worded for the person adding one."""
    message = str(exc)
    if '"code":"23505"' in message:
        return HTTPException(status_code=409, detail="This wish is already on the list")
    if '"code":"23514"' in message and "300 wishes" in message:
        return HTTPException(status_code=409, detail="The 300 wishes exercise is full")
    return None


@app.get("/api/wishes")
async def list_wishes(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.list_wishes(token)


@app.post("/api/wishes", status_code=201)
async def create_wish(
    wish: WishCreate,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    try:
        return await request.app.state.repository.create_wish(token, user_id, wish)
    except SupabaseError as exc:
        conflict = _wish_conflict(exc)
        if conflict:
            raise conflict from exc
        raise


@app.put("/api/wishes/order")
async def reorder_wishes(
    order: WishOrder,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    """Saves the order the user dragged one list into."""
    moved = await request.app.state.repository.reorder_wishes(token, order.list, order.ids)
    return {"moved": moved}


@app.patch("/api/wishes/{wish_id}")
async def update_wish(
    wish_id: UUID,
    wish: WishUpdate,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    try:
        updated = await request.app.state.repository.update_wish(token, wish_id, wish)
    except SupabaseError as exc:
        conflict = _wish_conflict(exc)
        if conflict:
            raise conflict from exc
        raise
    if updated is None:
        raise HTTPException(status_code=404, detail="Wish not found")
    return updated


@app.delete("/api/wishes/{wish_id}", status_code=204)
async def delete_wish(
    wish_id: UUID,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    if not await request.app.state.repository.delete_wish(token, wish_id):
        raise HTTPException(status_code=404, detail="Wish not found")
    return Response(status_code=204)


@app.post("/api/wishes/check")
async def check_wish(
    payload: WishCheck,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    """Which of the user's exercise wishes a new wish repeats, judged by Claude."""
    existing = [
        wish
        for wish in await request.app.state.repository.list_wishes(token, "exercise")
        if str(wish["id"]) != str(payload.exclude_id)
    ]
    result = await request.app.state.wish_matcher.find(
        payload.text, existing, ai_allowed=lambda: _use_ai(request, token, "wish_check")
    )
    return {
        "source": result.source,
        "matches": [
            {"id": match.id, "text": match.text, "reason": match.reason} for match in result.matches
        ],
    }


ARTICLE_BUCKET = "education"
ARTICLE_IMAGE_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}
ARTICLE_IMAGE_MAX_BYTES = 5 * 1024 * 1024


def _with_image_url(request: Request, article: dict) -> dict:
    path = article.get("image_path")
    url = request.app.state.gateway.public_object_url(ARTICLE_BUCKET, path) if path else None
    return {**article, "image_url": url}


@app.get("/api/education/articles")
async def list_education_articles(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    rows = await request.app.state.repository.list_published_articles(token)
    return [_with_image_url(request, row) for row in rows]


@app.get("/api/share-links")
async def list_share_links(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.list_share_links(token)


@app.post("/api/share-links", status_code=201)
async def create_share_link(
    payload: ShareLinkCreate,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    """Turns on a share link, or returns the one that is already on."""
    repository = request.app.state.repository
    for link in await repository.list_share_links(token):
        same_portfolio = str(link.get("portfolio_id")) == str(payload.portfolio_id)
        if link["kind"] == payload.kind and (payload.kind == "fire" or same_portfolio):
            return link
    try:
        return await repository.create_share_link(
            token, user_id, new_token(), payload.kind, payload.portfolio_id
        )
    except SupabaseError as exc:
        raise HTTPException(status_code=404, detail="Portfolio not found") from exc


@app.delete("/api/share-links/{share_token}", status_code=204)
async def delete_share_link(
    share_token: str,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    """Turns a link off; anyone holding it loses access at once."""
    if not await request.app.state.repository.delete_share_link(token, share_token):
        raise HTTPException(status_code=404, detail="Link not found")
    request.app.state.shares.forget(share_token)
    return Response(status_code=204)


@app.get("/api/share/{share_token}")
async def view_shared_page(share_token: str, request: Request):
    """Public: what a share link shows. No sign-in; the token is the only key."""
    if not 32 <= len(share_token) <= 64:
        raise HTTPException(status_code=404, detail="This link is not active")
    page = await request.app.state.shares.page(share_token)
    if page is None:
        raise HTTPException(status_code=404, detail="This link is not active")
    return page


@app.get("/api/admin/connections")
async def admin_list_connections(
    request: Request, _account: Annotated[Account, Depends(require_admin)]
):
    return request.app.state.connections.describe()


@app.put("/api/admin/connections/{connection_id}")
async def admin_save_connection(
    connection_id: str,
    payload: ConnectionUpdate,
    request: Request,
    _account: Annotated[Account, Depends(require_admin)],
):
    service: ConnectionsService = request.app.state.connections
    try:
        await service.save(connection_id, payload.values)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Connection not found") from exc
    except ConnectionSetupError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await apply_connections(request.app)
    return next(item for item in service.describe() if item["id"] == connection_id)


@app.post("/api/admin/connections/{connection_id}/test")
async def admin_test_connection(
    connection_id: str,
    request: Request,
    _account: Annotated[Account, Depends(require_admin)],
):
    studio = await request.app.state.repository.load_settings()
    context = {
        "model": studio.llm_model,
        "market": request.app.state.market,
        "gateway": request.app.state.gateway,
    }
    try:
        return await request.app.state.connections.test(connection_id, context)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Connection not found") from exc


@app.get("/api/admin/education/articles")
async def admin_list_articles(
    request: Request, _account: Annotated[Account, Depends(require_admin)]
):
    rows = await request.app.state.repository.list_all_articles()
    return [_with_image_url(request, row) for row in rows]


@app.post("/api/admin/education/articles", status_code=201)
async def admin_create_article(
    article: EducationArticleInput,
    request: Request,
    _account: Annotated[Account, Depends(require_admin)],
):
    return _with_image_url(request, await request.app.state.repository.create_article(article))


@app.put("/api/admin/education/articles/{article_id}")
async def admin_update_article(
    article_id: UUID,
    article: EducationArticleInput,
    request: Request,
    _account: Annotated[Account, Depends(require_admin)],
):
    repository = request.app.state.repository
    before = await repository.get_article(article_id)
    if before is None:
        raise HTTPException(status_code=404, detail="Article not found")
    updated = await repository.update_article(article_id, article)
    if updated is None:
        raise HTTPException(status_code=404, detail="Article not found")
    old_path = before.get("image_path")
    if old_path and old_path != article.image_path:
        # A replaced or removed picture is not needed anymore.
        with suppress(SupabaseError):
            await request.app.state.gateway.delete_object(ARTICLE_BUCKET, old_path)
    return _with_image_url(request, updated)


@app.delete("/api/admin/education/articles/{article_id}", status_code=204)
async def admin_delete_article(
    article_id: UUID,
    request: Request,
    _account: Annotated[Account, Depends(require_admin)],
):
    deleted = await request.app.state.repository.delete_article(article_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Article not found")
    if deleted.get("image_path"):
        with suppress(SupabaseError):
            await request.app.state.gateway.delete_object(ARTICLE_BUCKET, deleted["image_path"])
    return Response(status_code=204)


@app.post("/api/admin/education/images", status_code=201)
async def admin_upload_article_image(
    request: Request,
    _account: Annotated[Account, Depends(require_admin)],
    image: Annotated[UploadFile, File()],
):
    extension = ARTICLE_IMAGE_TYPES.get(image.content_type or "")
    if extension is None:
        raise HTTPException(status_code=422, detail="Use a PNG, JPEG, WebP, or GIF picture")
    content = await image.read(ARTICLE_IMAGE_MAX_BYTES + 1)
    if not content:
        raise HTTPException(status_code=422, detail="The picture is empty")
    if len(content) > ARTICLE_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Pictures can be up to 5 MB")
    path = f"articles/{uuid4().hex}.{extension}"
    try:
        await request.app.state.gateway.upload_object(
            ARTICLE_BUCKET, path, content, image.content_type or ""
        )
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail="The picture could not be stored") from exc
    return {
        "image_path": path,
        "image_url": request.app.state.gateway.public_object_url(ARTICLE_BUCKET, path),
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/portfolios")
async def list_portfolios(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.list_portfolios(token)


@app.get("/api/securities/resolve")
async def resolve_security(
    query: str,
    request: Request,
    _user_id: Annotated[UUID, Depends(current_user)],
    base_currency: str = "USD",
):
    try:
        return await asyncio.to_thread(
            request.app.state.market.resolve,
            query,
            base_currency=base_currency,
        )
    except SecurityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except YahooPriceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


MAX_HISTORY_TICKERS = 40
MAX_FUND_TICKERS = 30
MAX_RESOLVE_BATCH = 60


@app.post("/api/securities/resolve-batch")
async def resolve_securities(
    payload: ResolveBatch,
    request: Request,
    _user_id: Annotated[UUID, Depends(current_user)],
):
    """Market data for a whole portfolio in one request: one server, shared caches,
    lookups side by side. Each item carries its data or its own error."""
    queries = [query.strip() for query in payload.queries if query.strip()]
    if len(queries) > MAX_RESOLVE_BATCH:
        raise HTTPException(status_code=422, detail=f"At most {MAX_RESOLVE_BATCH} holdings at once")
    market = request.app.state.market
    limit = asyncio.Semaphore(8)

    async def one(query: str) -> dict:
        async with limit:
            try:
                data = await asyncio.to_thread(
                    market.resolve, query, base_currency=payload.base_currency
                )
                return {"query": query, "data": data}
            except (SecurityNotFoundError, YahooPriceError) as exc:
                return {"query": query, "error": str(exc)}
            except Exception:  # one bad holding must not hide the others
                logger.exception("Market data lookup failed for %s", query)
                return {"query": query, "error": "Market data is unavailable right now"}

    return await asyncio.gather(*(one(query) for query in queries))


@app.get("/api/prices/history")
async def price_history(
    request: Request,
    _user_id: Annotated[UUID, Depends(current_user)],
    tickers: Annotated[str, Query(min_length=1, max_length=600)],
    start: Annotated[date, Query(alias="from")],
):
    try:
        symbols = sorted(
            {
                PositionInput(ticker=item, shares=0).ticker
                for item in tickers.split(",")
                if item.strip()
            }
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="One of the tickers is not valid") from exc
    if not symbols or len(symbols) > MAX_HISTORY_TICKERS:
        raise HTTPException(
            status_code=422, detail=f"Ask for between 1 and {MAX_HISTORY_TICKERS} tickers"
        )
    earliest = date.today() - timedelta(days=366 * 10)
    if start < earliest or start > date.today():
        raise HTTPException(status_code=422, detail="Pick a start date within the last 10 years")
    return await asyncio.to_thread(request.app.state.market.close_history, symbols, start)


@app.get("/api/funds/holdings")
async def fund_holdings(
    request: Request,
    _user_id: Annotated[UUID, Depends(current_user)],
    tickers: Annotated[str, Query(min_length=1, max_length=400)],
):
    """Top holdings and sector weights per fund, for look-through allocations.

    Tickers that are not funds, or whose data is unavailable, are left out.
    """
    try:
        symbols = sorted(
            {
                PositionInput(ticker=item, shares=0).ticker
                for item in tickers.split(",")
                if item.strip()
            }
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="One of the tickers is not valid") from exc
    if not symbols or len(symbols) > MAX_FUND_TICKERS:
        raise HTTPException(
            status_code=422, detail=f"Ask for between 1 and {MAX_FUND_TICKERS} tickers"
        )
    lookup = getattr(request.app.state.market.prices, "fund_holdings", None)
    if lookup is None:
        return {}
    limit = asyncio.Semaphore(8)

    async def one(symbol: str):
        async with limit:
            try:
                return await asyncio.to_thread(lookup, symbol)
            except Exception:  # one bad fund must not hide the others
                logger.exception("Fund holdings lookup failed for %s", symbol)
                return None

    results = await asyncio.gather(*(one(symbol) for symbol in symbols))
    return {symbol: data for symbol, data in zip(symbols, results, strict=True) if data}


@app.get("/api/fx")
async def exchange_rate(
    request: Request,
    _user_id: Annotated[UUID, Depends(current_user)],
    source: str = Query(min_length=3, max_length=3, pattern="^[A-Za-z]{3}$", alias="from"),
    target: str = Query(min_length=3, max_length=3, pattern="^[A-Za-z]{3}$", alias="to"),
):
    rate = await asyncio.to_thread(request.app.state.market.fx_rate, source, target)
    if rate is None:
        raise HTTPException(
            status_code=404,
            detail=f"No exchange rate is available for {source.upper()} to {target.upper()}",
        )
    return {"from": source.upper(), "to": target.upper(), "rate": rate}


@app.post("/api/portfolios", status_code=201)
async def create_portfolio(
    payload: PortfolioCreate,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    return await request.app.state.repository.create_portfolio(token, payload)


@app.put("/api/portfolios/{portfolio_id}")
async def update_portfolio(
    portfolio_id: UUID,
    payload: PortfolioCreate,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    portfolio = await request.app.state.repository.update_portfolio(token, portfolio_id, payload)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@app.get("/api/portfolios/{portfolio_id}/transactions")
async def list_position_transactions(
    portfolio_id: UUID,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    repository: Repository = request.app.state.repository
    if await repository.get_portfolio(portfolio_id, user_id) is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return await repository.list_transactions(token, portfolio_id)


@app.post("/api/portfolios/{portfolio_id}/transactions", status_code=201)
async def add_position_transaction(
    portfolio_id: UUID,
    transaction: PositionTransaction,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    repository: Repository = request.app.state.repository
    portfolio = await repository.get_portfolio(portfolio_id, user_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if transaction.kind == "sell":
        matching = next(
            (
                item
                for item in portfolio["portfolio_positions"]
                if item["ticker"].upper() == transaction.ticker
            ),
            None,
        )
        if matching is None:
            raise HTTPException(status_code=422, detail="Cannot sell a position not held")
        if transaction.quantity > int(matching["shares"]):
            raise HTTPException(status_code=422, detail="Sale exceeds the held quantity")
    return await repository.apply_transaction(token, portfolio_id, transaction)


@app.delete("/api/portfolios/{portfolio_id}", status_code=204)
async def delete_portfolio(
    portfolio_id: UUID,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    if not await request.app.state.repository.delete_portfolio(token, portfolio_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return Response(status_code=204)


@app.post("/api/portfolios/extract-image")
async def extract_portfolio_image(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
    image: Annotated[UploadFile, File()],
):
    await _require_ai(request, token, "screenshot_import")
    settings = request.app.state.settings
    try:
        extractor = PortfolioImageExtractor(
            api_key=settings.openai_api_key,
            model=settings.openai_vision_model,
        )
        positions = await asyncio.to_thread(
            extractor.extract,
            await image.read(),
            image.content_type or "",
        )
    except PortfolioImageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"positions": [position.model_dump(exclude_none=True) for position in positions]}


@app.post("/api/analyses", status_code=202)
async def create_analysis(
    payload: AnalysisCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    user_id: Annotated[UUID, Depends(current_user)],
):
    repository: Repository = request.app.state.repository
    portfolio = await repository.get_portfolio(payload.portfolio_id, user_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    positions = {position["ticker"].upper() for position in portfolio["portfolio_positions"]}
    if payload.ticker not in positions:
        raise HTTPException(
            status_code=422,
            detail="The first MVP can analyze only a ticker held in this portfolio",
        )
    as_of = min(payload.as_of, latest_review_date())
    blocker = (
        await request.app.state.analysis.review_blockers([payload.ticker], as_of.isoformat())
    )[payload.ticker]
    if blocker:
        raise HTTPException(
            status_code=422,
            detail=f"{payload.ticker} can't be reviewed yet. {blocker} No token was used.",
        )
    problem = await request.app.state.analysis.ready()
    if problem:
        raise HTTPException(
            status_code=503,
            detail=(f"AI reviews can't run right now. {problem} No token was used."),
        )
    await _require_ai(request, token, "ai_review")
    # The review library only accepts closes through yesterday (New York); a newer
    # date would fail with "requires incomplete data", so as_of above uses the latest
    # final close.
    run = await repository.create_run(
        user_id, payload.portfolio_id, payload.ticker, as_of.isoformat()
    )
    review = (
        request.app.state.analysis.run,
        UUID(run["id"]),
        user_id,
        portfolio,
        payload.ticker,
        as_of.isoformat(),
    )
    if request.app.state.settings.serverless:
        # Nothing keeps running after the response on Vercel, so finish the review first.
        await review[0](*review[1:])
        return await repository.get_run(UUID(run["id"]), user_id) or run
    background_tasks.add_task(*review)
    return run


@app.get("/api/ai-usage")
async def ai_usage(
    request: Request,
    token: Annotated[str, Depends(bearer_token)],
    _user_id: Annotated[UUID, Depends(current_user)],
):
    """AI tokens per feature in its current period: one token is one use, such as one
    holding review. Review tokens are monthly; the other features reset daily."""
    studio = await request.app.state.repository.load_settings()
    used = await request.app.state.repository.ai_usage_today(token)
    return {
        feature: {
            "used": used.get(feature, 0),
            "limit": studio.daily_limit(feature),
            "left": max(studio.daily_limit(feature) - used.get(feature, 0), 0),
            "period": "month" if feature in MONTHLY_AI_FEATURES else "day",
            "resets_on": ai_usage_period(feature)[1].isoformat(),
        }
        for feature in ("ai_review", "screenshot_import", "wish_check")
    }


@app.post("/api/admin/ai-usage/reset")
async def reset_my_ai_usage(request: Request, account: Annotated[Account, Depends(require_admin)]):
    """Gives the signed-in admin a full AI allowance again (this month's review tokens
    and today's other uses), for testing."""
    removed = await request.app.state.repository.reset_ai_usage_today(account.id)
    return {"reset": removed}


@app.get("/api/cron/reminders")
async def cron_reminders(request: Request, authorization: Annotated[str | None, Header()] = None):
    """Sends due report reminders; Vercel Cron calls this once a day with CRON_SECRET."""
    secret = request.app.state.settings.cron_secret
    # Constant-time comparison, so response timing can't reveal the secret.
    if not secret or not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Not allowed")
    return {"sent": await request.app.state.reminders.send_due()}


@app.get("/api/analyses/readiness")
async def review_readiness(
    request: Request,
    _user_id: Annotated[UUID, Depends(current_user)],
    tickers: str,
    as_of: date | None = None,
):
    """Which tickers can get an Ask Buddy review: None, or why not (e.g. too few filings)."""
    names = sorted({ticker.strip().upper() for ticker in tickers.split(",") if ticker.strip()})
    if not names or len(names) > 60:
        raise HTTPException(status_code=422, detail="Send between 1 and 60 tickers")
    day = min(as_of or latest_review_date(), latest_review_date())
    return await request.app.state.analysis.review_blockers(names, day.isoformat())


@app.get("/api/analyses/{run_id}")
async def get_analysis(
    run_id: UUID,
    request: Request,
    user_id: Annotated[UUID, Depends(current_user)],
):
    run = await request.app.state.repository.get_run(run_id, user_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return run
