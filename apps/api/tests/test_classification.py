from types import SimpleNamespace

from stockbuddy.classification import classify_security, lifecycle_phase


def test_etf_classification_keeps_asset_type_separate_from_sector():
    classification = classify_security("ETF", "iShares Bitcoin Trust ETF", "Investment Trusts")

    assert classification == {
        "asset_type": "ETF",
        "sector": "Not Applicable",
        "industry": "Investment Trusts",
        "investment_category": "Digital Asset",
    }


def test_operating_company_sector_uses_sec_industry():
    classification = classify_security("EQUITY", "NVIDIA Corporation", "Semiconductors")

    assert classification["asset_type"] == "Common Stock"
    assert classification["sector"] == "Information Technology"
    assert classification["investment_category"] is None


def test_equity_named_trust_stays_an_operating_company():
    classification = classify_security(
        "EQUITY", "Northern Trust Corporation", "State Commercial Banks"
    )

    assert classification["asset_type"] == "Common Stock"
    assert classification["sector"] == "Financials"
    assert classification["investment_category"] is None


def test_trust_name_without_equity_type_is_still_a_pooled_trust():
    classification = classify_security(None, "SPDR Gold Trust", None)

    assert classification["asset_type"] == "Trust"
    assert classification["sector"] == "Not Applicable"
    assert classification["investment_category"] == "Commodity"


def test_lifecycle_never_invents_a_phase_without_required_evidence():
    phase, evidence = lifecycle_phase(
        "Common Stock",
        [SimpleNamespace(report_period="2026-06-30", revenue_growth=None)],
    )

    assert phase == "Not Analyzed"
    assert "required" in evidence["reason"].lower()


def test_lifecycle_uses_documented_growth_evidence():
    phase, evidence = lifecycle_phase(
        "Common Stock",
        [
            SimpleNamespace(
                report_period="2026-06-30",
                revenue_growth=0.25,
                operating_margin=0.18,
                free_cash_flow_per_share=2.0,
                payout_ratio=0.0,
            ),
            SimpleNamespace(operating_margin=0.15),
        ],
    )

    assert phase == "Hyper Growth"
    assert evidence["revenue_growth"] == 0.25
