from __future__ import annotations

from collections.abc import Iterable
from typing import Any

SECTORS = (
    "Communication Services",
    "Consumer Discretionary",
    "Consumer Staples",
    "Energy",
    "Financials",
    "Health Care",
    "Industrials",
    "Information Technology",
    "Materials",
    "Real Estate",
    "Utilities",
    "Not Applicable",
    "Unknown",
)

_SECTOR_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "Information Technology",
        ("technology", "computer", "software", "semiconductor", "electronic"),
    ),
    ("Health Care", ("hospital", "medical", "health", "pharmaceutical", "biological")),
    ("Financials", ("bank", "insurance", "investment", "finance", "broker")),
    ("Consumer Discretionary", ("motor vehicle", "automobile", "retail", "restaurant")),
    ("Consumer Staples", ("food", "beverage", "grocery", "tobacco", "household")),
    ("Industrials", ("air transportation", "aerospace", "missile", "machinery", "freight")),
    ("Communication Services", ("telecom", "broadcast", "communication", "media")),
    ("Energy", ("oil", "gas", "petroleum", "coal")),
    ("Materials", ("mining", "chemical", "steel", "metal", "paper")),
    ("Real Estate", ("real estate", "reit")),
    ("Utilities", ("electric service", "water supply", "natural gas distribution")),
)


def classify_security(
    instrument_type: str | None,
    name: str | None,
    industry: str | None,
) -> dict[str, str | None]:
    kind = (instrument_type or "").upper()
    label = (name or "").casefold()
    if kind == "INDEX":
        asset_type = "Index"
    elif kind == "ETF":
        asset_type = "ETF"
    elif kind == "MUTUALFUND":
        asset_type = "Mutual Fund"
    elif "closed-end" in label or "closed end" in label:
        asset_type = "Closed-End Fund"
    elif "preferred" in label:
        asset_type = "Preferred Stock"
    elif " adr" in f" {label}" or "depositary" in label:
        asset_type = "ADR"
    elif "reit" in label:
        asset_type = "REIT"
    elif "trust" in label and kind != "EQUITY":
        asset_type = "Trust"
    elif kind == "EQUITY":
        asset_type = "Common Stock"
    else:
        asset_type = "Other"

    pooled = asset_type in {"ETF", "Mutual Fund", "Closed-End Fund", "Trust", "Index"}
    return {
        "asset_type": asset_type,
        "sector": "Not Applicable" if pooled else classify_sector(industry),
        "industry": industry,
        "investment_category": investment_category(name) if pooled else None,
    }


def classify_sector(industry: str | None) -> str:
    if not industry:
        return "Unknown"
    folded = industry.casefold()
    for sector, keywords in _SECTOR_RULES:
        if any(keyword in folded for keyword in keywords):
            return sector
    return "Unknown"


def investment_category(name: str | None) -> str:
    folded = (name or "").casefold()
    rules: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("Digital Asset", ("bitcoin", "crypto", "digital asset", "ether")),
        ("Commodity", ("gold", "silver", "commodity", "oil", "metal")),
        ("Fixed Income", ("bond", "treasury", "fixed income", "income")),
        ("International", ("international", "global", "emerging", "ex-us", "foreign")),
        ("Sector", ("sector", "technology", "health care", "financial", "energy")),
        ("Thematic", ("thematic", "innovation", "clean energy", "robotics", "artificial")),
        ("Broad Market", ("s&p", "total market", "nasdaq", "dow", "broad market", "index")),
    )
    for category, keywords in rules:
        if any(keyword in folded for keyword in keywords):
            return category
    return "Other"


def lifecycle_phase(asset_type: str, metrics: Iterable[Any]) -> tuple[str, dict[str, Any]]:
    if asset_type in {"ETF", "Mutual Fund", "Closed-End Fund", "Trust", "Index"}:
        return "Not Applicable", {"reason": "Lifecycle phases apply to operating companies."}
    rows = list(metrics)
    if len(rows) < 2:
        return "Not Analyzed", {"reason": "At least two financial periods are required."}
    latest, previous = rows[0], rows[1]
    growth = getattr(latest, "revenue_growth", None)
    margin = getattr(latest, "operating_margin", None)
    previous_margin = getattr(previous, "operating_margin", None)
    free_cash_flow = getattr(latest, "free_cash_flow_per_share", None)
    payout = getattr(latest, "payout_ratio", None)
    evidence = {
        "report_period": getattr(latest, "report_period", None),
        "revenue_growth": growth,
        "operating_margin": margin,
        "previous_operating_margin": previous_margin,
        "free_cash_flow_per_share": free_cash_flow,
        "payout_ratio": payout,
    }
    if growth is None or margin is None:
        return "Not Analyzed", {
            **evidence,
            "reason": "Revenue growth and operating margin are required.",
        }
    margin_change = margin - previous_margin if previous_margin is not None else None
    if growth <= -0.05 and (
        (margin_change is not None and margin_change <= -0.02)
        or (free_cash_flow is not None and free_cash_flow <= 0)
    ):
        return "Decline", evidence
    if growth >= 0.20:
        return "Hyper Growth", evidence
    if growth > 0 and margin <= 0 and (free_cash_flow is None or free_cash_flow <= 0):
        return "Startup", evidence
    if growth > 0 and margin_change is not None and margin_change >= 0.02:
        return "Operating Leverage", evidence
    if (
        margin > 0
        and free_cash_flow is not None
        and free_cash_flow > 0
        and (payout is not None and payout >= 0.10)
    ):
        return "Capital Return", evidence
    return "Not Analyzed", {
        **evidence,
        "reason": "Available evidence does not meet a lifecycle rule.",
    }
