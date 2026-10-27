from datetime import UTC, date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class PositionInput(BaseModel):
    ticker: str = Field(min_length=1, max_length=12)
    shares: int = Field(ge=0)
    purchase_price: float | None = Field(default=None, ge=0)
    sector: str | None = Field(default=None, min_length=1, max_length=80)
    display_order: int | None = Field(default=None, ge=0)
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    asset_type: Literal[
        "Common Stock",
        "Preferred Stock",
        "ADR",
        "REIT",
        "ETF",
        "Mutual Fund",
        "Closed-End Fund",
        "Trust",
        "Index",
        "Other",
    ] = "Other"
    industry: str | None = Field(default=None, min_length=1, max_length=160)
    investment_category: (
        Literal[
            "Broad Market",
            "Sector",
            "International",
            "Fixed Income",
            "Commodity",
            "Digital Asset",
            "Thematic",
            "Other",
        ]
        | None
    ) = None
    classification_source: Literal["automatic", "manual"] = "automatic"
    quote_currency: str | None = Field(default=None, min_length=3, max_length=3)
    lifecycle_phase: Literal[
        "Startup",
        "Hyper Growth",
        "Operating Leverage",
        "Capital Return",
        "Decline",
        "Not Analyzed",
        "Not Applicable",
    ] = "Not Analyzed"
    lifecycle_evidence: dict[str, Any] = Field(default_factory=dict)
    lifecycle_updated_at: datetime | None = None
    report_date: date | None = None
    report_source: str | None = Field(default=None, min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        ticker = value.strip().upper()
        if not ticker or not all(c.isalnum() or c in ".-" for c in ticker):
            raise ValueError("ticker contains unsupported characters")
        return ticker

    @field_validator("sector")
    @classmethod
    def normalize_sector(cls, value: str | None) -> str | None:
        return value.strip() if value else None

    @field_validator("quote_currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        currency = value.strip().upper() if value else None
        if currency and (len(currency) != 3 or not currency.isalpha()):
            raise ValueError("quote currency must be a three-letter code")
        return currency


class PortfolioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    cash: float = Field(ge=0)
    base_currency: str = Field(default="USD", min_length=3, max_length=3)
    benchmark: str = Field(default="SPY", min_length=1, max_length=20)
    max_position_pct: float | None = Field(default=None, ge=0, le=1)
    max_sector_pct: float | None = Field(default=None, ge=0, le=1)
    min_cash_pct: float = Field(default=0, ge=0, le=1)
    time_horizon: Literal["Short Term", "Medium Term", "Long Term"] = "Long Term"
    rebalancing_threshold_pct: float = Field(default=0.05, ge=0, le=1)
    positions: list[PositionInput] = Field(default_factory=list)

    @field_validator("base_currency")
    @classmethod
    def normalize_base_currency(cls, value: str) -> str:
        currency = value.strip().upper()
        if len(currency) != 3 or not currency.isalpha():
            raise ValueError("base currency must be a three-letter code")
        return currency

    @field_validator("benchmark")
    @classmethod
    def normalize_benchmark(cls, value: str) -> str:
        return value.strip().upper()


class Portfolio(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    cash: float
    base_currency: str = "USD"
    benchmark: str = "SPY"
    max_position_pct: float | None = None
    max_sector_pct: float | None = None
    min_cash_pct: float = 0
    time_horizon: Literal["Short Term", "Medium Term", "Long Term"] = "Long Term"
    rebalancing_threshold_pct: float = 0.05
    positions: list[PositionInput]
    created_at: datetime
    updated_at: datetime


class PositionTransaction(BaseModel):
    ticker: str = Field(min_length=1, max_length=12)
    kind: Literal["buy", "sell"]
    quantity: int = Field(gt=0)
    price: float = Field(ge=0)
    transacted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_validator("ticker")
    @classmethod
    def normalize_transaction_ticker(cls, value: str) -> str:
        return PositionInput(ticker=value, shares=0).ticker


class ReminderCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=12)
    remind_on: date
    portfolio_id: UUID | None = None
    company_name: str | None = Field(default=None, max_length=200)
    last_report_date: date | None = None

    @field_validator("ticker")
    @classmethod
    def normalize_reminder_ticker(cls, value: str) -> str:
        return PositionInput(ticker=value, shares=0).ticker

    @field_validator("remind_on")
    @classmethod
    def not_in_the_past(cls, value: date) -> date:
        if value < datetime.now(UTC).date():
            raise ValueError("Pick today or a later date")
        return value


FireCategory = Literal[
    # Incomes (Path2Wealth's income categories)
    "salary",
    "rent_income",
    "savings",
    "cd",
    "bond",
    "dividends",
    "bonus",
    "freelance",
    # Expenses (Path2Wealth's expense categories)
    "food",
    "transport",
    "shopping",
    "bills",
    "fun",
    "health",
    "home",
    "rent",
    "lease",
    "finance",
    "insurance",
    "investment",
    "saving",
    "tax",
    "education",
    "travel",
    "other",
]

INCOME_CATEGORIES = {
    "salary",
    "rent_income",
    "savings",
    "cd",
    "bond",
    "dividends",
    "bonus",
    "freelance",
    "other",
}
EXPENSE_CATEGORIES = {
    "food",
    "transport",
    "shopping",
    "bills",
    "fun",
    "health",
    "home",
    "rent",
    "lease",
    "finance",
    "insurance",
    "investment",
    "saving",
    "tax",
    "education",
    "travel",
    "other",
}


FireAssetType = Literal[
    "residential", "vacation", "commercial", "land", "vehicle", "equipment", "other"
]


class FireAssetInput(BaseModel):
    asset_type: FireAssetType
    name: str = Field(min_length=1, max_length=120)
    market_value: float | None = Field(default=None, ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    location: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Name is required")
        return name

    @field_validator("location")
    @classmethod
    def blank_location_is_none(cls, value: str | None) -> str | None:
        return (value or "").strip() or None

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, value: str) -> str:
        currency = value.strip().upper()
        if not currency.isalpha():
            raise ValueError("currency must be a three-letter code")
        return currency


class FireEntryInput(BaseModel):
    kind: Literal["income", "expense"]
    category: FireCategory
    name: str = Field(min_length=1, max_length=120)
    amount: float = Field(ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    frequency: Literal["once", "monthly", "quarterly", "semiannual", "annual"] = "monthly"
    starts_on: date
    ends_on: date | None = None
    principal: float | None = Field(default=None, ge=0)
    yield_pct: float | None = Field(default=None, ge=0, le=100)
    quantity: float | None = Field(default=None, ge=0)
    unit_price: float | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=500)
    # Rental income: the asset that earns it, or a new asset to create and link.
    asset_id: UUID | None = None
    new_asset: FireAssetInput | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Name is required")
        return name

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, value: str) -> str:
        currency = value.strip().upper()
        if not currency.isalpha():
            raise ValueError("currency must be a three-letter code")
        return currency

    @model_validator(mode="after")
    def consistent(self) -> "FireEntryInput":
        allowed = INCOME_CATEGORIES if self.kind == "income" else EXPENSE_CATEGORIES
        if self.category not in allowed:
            raise ValueError(f"{self.category} is not a {self.kind} category")
        if self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("The end date must be on or after the start date")
        if self.category != "rent_income" and (self.asset_id or self.new_asset):
            raise ValueError("Only rental income can link to an asset")
        if self.asset_id and self.new_asset:
            raise ValueError("Link an existing asset or create a new one, not both")
        if self.category == "rent_income":
            # The property's value lives on its asset now.
            self.principal = None
        if self.quantity is not None and self.unit_price is not None:
            # Face value is always quantity × price per bond.
            self.principal = round(self.quantity * self.unit_price, 2)
        return self


class FireSettingsInput(BaseModel):
    expected_return_pct: float = Field(default=7, ge=-50, le=50)
    retirement_annual_spend: float | None = Field(default=None, ge=0)
    monthly_invest: float | None = Field(default=None, ge=0)
    withdrawal_rate_pct: float = Field(default=4, ge=1, le=10)
    inflation_pct: float = Field(default=3, ge=-5, le=20)


class ProfileInput(BaseModel):
    date_of_birth: date | None = None
    display_name: str | None = Field(default=None, max_length=80)

    @field_validator("display_name")
    @classmethod
    def tidy_name(cls, value: str | None) -> str | None:
        return " ".join((value or "").split()) or None

    @field_validator("date_of_birth")
    @classmethod
    def plausible_birth_date(cls, value: date | None) -> date | None:
        if value is not None and not date(1900, 1, 1) <= value <= datetime.now(UTC).date():
            raise ValueError("Enter a date of birth between 1900 and today")
        return value


class StudioPersonaUpdate(BaseModel):
    persona: Literal["graham", "buffett", "munger", "lynch", "druckenmiller"]
    prompt: str


class IndustryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: str = Field(min_length=1, max_length=16)


class StudioUpdate(BaseModel):
    max_position_pct: float = Field(gt=0, le=1)
    max_industry_pct: float = Field(gt=0, le=1)
    deep_value_weight: float = Field(gt=0, lt=1)
    llm_model: str = Field(min_length=1, max_length=80)
    use_transaction_history_analytics: bool = True
    min_cash_pct: float = Field(default=0.05, ge=0, le=1)
    daily_wish_checks: int = Field(default=100, ge=0, le=10000)
    daily_screenshot_imports: int = Field(default=20, ge=0, le=10000)
    daily_ai_reviews: int = Field(default=10, ge=0, le=10000)
    industries: list[IndustryUpdate] = Field(min_length=1)
    prompts: list[StudioPersonaUpdate] = Field(min_length=5, max_length=5)


class AnalysisCreate(BaseModel):
    portfolio_id: UUID
    ticker: str
    as_of: date = Field(default_factory=date.today)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        return PositionInput(ticker=value, shares=0).ticker


class SignalReport(BaseModel):
    strategy: str
    persona: str
    ticker: str
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float = Field(ge=0, le=100)
    value: float = Field(ge=-1, le=1)
    reasoning: str
    abstained: bool = False


class RecommendationReport(BaseModel):
    ticker: str
    label: Literal["sell", "hold", "add", "trim"]
    current_weight: float
    target_weight: float
    delta_shares: int
    mark: float


class AnalysisRun(BaseModel):
    id: UUID
    portfolio_id: UUID
    ticker: str
    as_of: date
    status: Literal["pending", "running", "completed", "failed"]
    error: str | None = None
    signals: list[SignalReport] = Field(default_factory=list)
    recommendation: RecommendationReport | None = None
    created_at: datetime
    completed_at: datetime | None = None


class EducationArticleInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=20000)
    image_path: str | None = Field(default=None, pattern=r"^articles/[A-Za-z0-9._-]{1,120}$")
    published: bool = True
    position: int = Field(default=0, ge=0, le=100000)

    @field_validator("title", "body")
    @classmethod
    def strip_text(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("This field is required")
        return text


WishList = Literal["short", "long", "want", "exercise"]


class WishCreate(BaseModel):
    list: WishList
    text: str = Field(min_length=1, max_length=200)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        text = " ".join(value.split())
        if not text:
            raise ValueError("Write the wish")
        return text


class WishUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=200)
    done: bool | None = None

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = " ".join(value.split())
        if not text:
            raise ValueError("Write the wish")
        return text


class WishOrder(BaseModel):
    list: WishList
    ids: list[UUID] = Field(min_length=1, max_length=300)


class WishCheck(BaseModel):
    text: str = Field(min_length=1, max_length=200)
    # When editing, the wish being changed is not compared with itself.
    exclude_id: UUID | None = None


class ConnectionUpdate(BaseModel):
    """Fields to change; a field set to None goes back to the value in .env."""

    values: dict[str, str | int | bool | None] = Field(min_length=1, max_length=10)


class ShareLinkCreate(BaseModel):
    kind: Literal["fire", "portfolio"]
    # FIRE: the portfolio whose value counts as current assets; Portfolio: the one shared.
    portfolio_id: UUID | None = None

    @model_validator(mode="after")
    def portfolio_for_portfolio_links(self) -> "ShareLinkCreate":
        if self.kind == "portfolio" and self.portfolio_id is None:
            raise ValueError("Choose the portfolio to share")
        return self
