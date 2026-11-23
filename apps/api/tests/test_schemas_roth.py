import pytest
from pydantic import ValidationError

from stockbuddy.schemas import FireEntryInput

BASE = {
    "kind": "income",
    "name": "Roth IRA",
    "amount": 0,
    "starts_on": "2026-11-16",
    "principal": 2000,
    "yield_pct": 7,
}


def test_a_roth_account_keeps_what_was_put_in_this_year():
    entry = FireEntryInput(**BASE, category="roth_ira", contributed=2000, contributed_year=2026)
    assert (entry.contributed, entry.contributed_year) == (2000, 2026)
    with pytest.raises(ValidationError):
        FireEntryInput(**BASE, category="roth_ira", contributed=2000)


def test_other_accounts_drop_the_deposit():
    entry = FireEntryInput(**BASE, category="savings", contributed=2000, contributed_year=2026)
    assert entry.contributed is None and entry.contributed_year is None
