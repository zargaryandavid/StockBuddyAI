from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IndustryDefault:
    name: str
    icon: str
    sort_order: int


DEFAULT_INDUSTRIES: tuple[IndustryDefault, ...] = (
    IndustryDefault("Communication Services", "message-circle", 1),
    IndustryDefault("Consumer Discretionary", "shopping-bag", 2),
    IndustryDefault("Consumer Staples", "shopping-cart", 3),
    IndustryDefault("Energy", "zap", 4),
    IndustryDefault("Financials", "landmark", 5),
    IndustryDefault("Health Care", "heart-pulse", 6),
    IndustryDefault("Industrials", "factory", 7),
    IndustryDefault("Information Technology", "cpu", 8),
    IndustryDefault("Materials", "package-open", 9),
    IndustryDefault("Real Estate", "building-2", 10),
    IndustryDefault("Utilities", "plug-zap", 11),
    IndustryDefault("Other", "shapes", 12),
)

INDUSTRY_ICON_NAMES: tuple[str, ...] = (
    *(item.icon for item in DEFAULT_INDUSTRIES),
    "chart-line",
    "plane",
    "shield",
    "bitcoin",
    "wheat",
    "car",
    "clapperboard",
    "graduation-cap",
    "rocket",
    "microscope",
    "radio-tower",
    "network",
    "globe-2",
    "briefcase",
    "pickaxe",
    "leaf",
    "ship",
    "bike",
)

_KEYWORD_ICONS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("index", "etf", "fund"), "chart-line"),
    (("aero", "airline", "aviation", "defense"), "plane"),
    (("crypto", "bitcoin", "blockchain"), "bitcoin"),
    (("insurance", "security"), "shield"),
    (("agri", "farm", "food"), "wheat"),
    (("auto", "vehicle", "transport"), "car"),
    (("media", "entertainment", "film"), "clapperboard"),
    (("education", "school"), "graduation-cap"),
    (("space", "rocket"), "rocket"),
    (("science", "biotech", "research"), "microscope"),
    (("telecom", "wireless"), "radio-tower"),
    (("internet", "network"), "network"),
    (("global", "international"), "globe-2"),
    (("business", "professional"), "briefcase"),
    (("mining",), "pickaxe"),
    (("environment", "clean", "green"), "leaf"),
    (("marine", "shipping"), "ship"),
    (("fitness", "sport"), "bike"),
)


def suggest_industry_icon(name: str, used: set[str]) -> str:
    defaults = {item.name.casefold(): item.icon for item in DEFAULT_INDUSTRIES}
    folded = name.strip().casefold()
    preferred = defaults.get(folded)
    if preferred is None:
        preferred = next(
            (
                icon
                for keywords, icon in _KEYWORD_ICONS
                if any(keyword in folded for keyword in keywords)
            ),
            None,
        )
    if preferred and preferred not in used:
        return preferred
    available = [icon for icon in INDUSTRY_ICON_NAMES if icon not in used]
    if not available:
        return "shapes"
    checksum = sum(ord(character) for character in folded)
    return available[checksum % len(available)]
