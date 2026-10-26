from __future__ import annotations

from hedge_fund.brokers.models import Position
from hedge_fund.pipeline.execution import build_orders


def recommendation_for(
    ticker: str,
    shares: int,
    mark: float,
    equity: float,
    target_weight: float,
) -> dict:
    if mark <= 0 or equity <= 0:
        raise ValueError("mark and equity must be positive")
    current_weight = shares * mark / equity
    difference = target_weight - current_weight

    if shares > 0 and target_weight < 0.02:
        label = "sell"
        effective_target = 0.0
    elif difference > 0.05:
        label = "add"
        effective_target = target_weight
    elif difference < -0.05:
        label = "trim"
        effective_target = target_weight
    else:
        label = "hold"
        effective_target = current_weight

    orders = build_orders(
        {ticker: effective_target},
        {ticker: Position(ticker=ticker, shares=shares)},
        {ticker: mark},
        equity,
    )
    delta_shares = 0
    if orders:
        order = orders[0]
        delta_shares = order.quantity if order.side == "buy" else -order.quantity
    return {
        "ticker": ticker,
        "label": label,
        "current_weight": current_weight,
        "target_weight": target_weight,
        "delta_shares": delta_shares,
        "mark": mark,
    }
