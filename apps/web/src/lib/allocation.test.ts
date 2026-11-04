import { describe, expect, it } from "vitest";

import type { Quote } from "@/lib/today";

import { allocationSummary, type AllocationItem } from "./allocation";

const item = (overrides: Partial<AllocationItem>): AllocationItem => ({
  label: "",
  ticker: "",
  name: "",
  mode: "pct",
  value: 0,
  expected_return_pct: null,
  ...overrides,
});

const quotes = new Map<string, Quote>([
  ["VXUS", { ticker: "VXUS", company_name: "Vanguard Total International Stock ETF", price: 70, growth_1y: 18.6, growth_1m: 1, growth_6m: 9, is_etf_index: true }],
  ["VOO", { ticker: "VOO", price: 600, growth_1y: 15.8 }],
]);

describe("allocationSummary", () => {
  it("turns shares of a budget in AMD into amounts, dollars, shares and last year's move", () => {
    const summary = allocationSummary(
      {
        budget: 54_000_000,
        currency: "AMD",
        items: [
          item({ label: "International equities", ticker: "VXUS", mode: "pct", value: 33 }),
          item({ label: "U.S. large-cap core", ticker: "VOO", mode: "amount", value: 7_000_000 }),
          item({ label: "Armenian bonds", name: "FNCABI / INTMB3 / AMTLB3", mode: "pct", value: 13, expected_return_pct: 11.6 }),
        ],
      },
      quotes,
      1 / 380,
    );
    const [vxus, voo, bonds] = summary.rows;
    expect(vxus.amount).toBe(17_820_000);
    expect(vxus.usd).toBeCloseTo(46894.74, 2);
    // $46,894.74 ÷ $70 = 669.9 shares, 669 whole.
    expect(vxus.shares).toBeCloseTo(669.92, 2);
    expect(vxus.wholeShares).toBe(669);
    expect(vxus).toMatchObject({ return1y: 18.6, returnSource: "market", fund: true, name: "Vanguard Total International Stock ETF" });
    expect(voo.pct).toBeCloseTo(12.96, 2);
    expect(bonds).toMatchObject({ return1y: 11.6, returnSource: "typed", shares: null, name: "FNCABI / INTMB3 / AMTLB3" });
    expect(summary.allocated).toBe(17_820_000 + 7_000_000 + 7_020_000);
    expect(summary.left).toBe(54_000_000 - summary.allocated);
    // Weighted by amount: (18.6×17.82 + 15.8×7 + 11.6×7.02) / 31.84.
    expect(summary.weightedReturn).toBeCloseTo((18.6 * 17.82 + 15.8 * 7 + 11.6 * 7.02) / 31.84, 4);
  });

  it("shows going over budget, and leaves dollars blank without an exchange rate", () => {
    const summary = allocationSummary(
      { budget: 1000, currency: "USD", items: [item({ ticker: "VOO", value: 80 }), item({ ticker: "NEW", value: 30 })] },
      quotes,
      null,
    );
    expect(summary.allocatedPct).toBeCloseTo(110, 9);
    expect(summary.left).toBeCloseTo(-100, 9);
    expect(summary.usd).toBeNull();
    expect(summary.rows[0].shares).toBeNull();
    expect(summary.rows[1]).toMatchObject({ price: null, return1y: null, returnSource: null });
  });
});
