import pytest

from stockbuddy.advice import recommendation_for


@pytest.mark.parametrize(
    ("shares", "target", "label"),
    [
        (20, 0.0, "sell"),
        (20, 0.25, "hold"),
        (5, 0.25, "add"),
        (40, 0.25, "trim"),
    ],
)
def test_recommendation_thresholds(shares, target, label):
    result = recommendation_for(
        ticker="AAPL",
        shares=shares,
        mark=100,
        equity=10_000,
        target_weight=target,
    )
    assert result["label"] == label


def test_sell_closes_the_position():
    result = recommendation_for("AAPL", shares=20, mark=100, equity=10_000, target_weight=0)
    assert result["delta_shares"] == -20
