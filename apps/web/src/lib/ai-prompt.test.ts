import { describe, expect, it } from "vitest";

import type { Portfolio } from "@/lib/api";
import type { FireEntry } from "@/lib/fire";
import type { Quote } from "@/lib/today";

import { buildAiPrompt, PROMPT_LEGEND, type PromptData, type PromptOptions } from "./ai-prompt";

const entry = (overrides: Partial<FireEntry>): FireEntry => ({
  id: overrides.name ?? "x",
  kind: "expense",
  category: "rent",
  name: "x",
  amount: 0,
  currency: "USD",
  frequency: "monthly",
  starts_on: "2026-01-01",
  ends_on: null,
  principal: null,
  yield_pct: null,
  note: null,
  ...overrides,
});

const portfolio = {
  id: "p1",
  name: "Long term",
  cash: 5000,
  base_currency: "USD",
  portfolio_positions: [
    { ticker: "NVDA", shares: 10, purchase_price: 100 },
    { ticker: "VOO", shares: 10, purchase_price: 400 },
  ],
} as unknown as Portfolio;

const data: PromptData = {
  today: "2026-11-04",
  currency: "USD",
  age: 38,
  portfolios: [portfolio],
  quotes: new Map<string, Quote>([
    ["NVDA", { ticker: "NVDA", company_name: "NVIDIA Corp", price: 200, day_change: 4, day_change_percent: 2, sector: "Information Technology" }],
    ["VOO", { ticker: "VOO", company_name: "Vanguard S&P 500 ETF", price: 500, day_change: -1, day_change_percent: -0.2, is_etf_index: true }],
  ]),
  rates: {},
  entries: [
    entry({ name: "Paycheck", kind: "income", category: "salary", amount: 6000 }),
    entry({ name: "Apartment rent", amount: 2000 }),
    entry({ name: "Emergency savings", kind: "income", category: "savings", principal: 12000, yield_pct: 4 }),
    entry({ name: "Roth", kind: "income", category: "roth_ira", principal: 20000, yield_pct: 7, frequency: "annual" }),
    entry({ name: "Roth from pay", category: "roth_contribution", amount: 625 }),
  ],
  assets: [{ id: "a1", asset_type: "residential", name: "Glendale condo", market_value: 400000, currency: "USD", note: null }],
  settings: { expected_return_pct: 7, retirement_annual_spend: null, monthly_invest: null, withdrawal_rate_pct: 4, inflation_pct: 0 },
  limits: { max_position_pct: 0.25, min_cash_pct: 0.05 },
  history: [
    { day: "2026-10-01", investments: 0, savings: 0, other_assets: 0, total: 430000 },
    { day: "2026-11-03", investments: 0, savings: 0, other_assets: 0, total: 444000 },
  ],
  wishes: [
    { list: "long", text: "Buy a house for my parents", done: false },
    { list: "short", text: "Max out my Roth IRA", done: false },
    { list: "want", text: "A good camera", done: true },
  ],
};

const options: PromptOptions = { goal: "review", question: "", amounts: "exact", names: true, answerIn: "en" };

describe("buildAiPrompt", () => {
  it("describes the whole picture in sections, with a legend for every symbol", () => {
    const prompt = buildAiPrompt(data, options);
    for (const heading of [
      "## 🎯 What I want from you",
      "## 🔑 Symbols used below",
      "## 👤 About me",
      "## 📊 Net worth today",
      "## 💼 Portfolios and holdings",
      "## 🏦 Savings, bonds and retirement accounts",
      "## 🏠 Property and other assets",
      "## ⬆️⬇️ Income and expenses",
      "## 🔥 My FIRE plan",
      "## ✅ My money to-do list (baby steps)",
      "## 📈 Net worth over time",
      "## 🎯 My goals (my vision)",
    ]) {
      expect(prompt).toContain(heading);
    }
    for (const [symbol] of PROMPT_LEGEND) expect(prompt).toContain(`${symbol} =`);
    expect(prompt).toContain("Age: 38");
    // NVDA is 2,000 of 12,000 (16.7%): a company under the 25% limit; VOO is a fund.
    expect(prompt).toMatch(/\| 📈 \| NVDA \| NVIDIA Corp \| Information Technology \| 10 \| \$200\.00 \| \$2,000\.00 \| 16\.7% \| \$100\.00 \| \+100\.0% \| \+2\.00% \|/);
    expect(prompt).toMatch(/\| 🧺 \| VOO \|/);
    expect(prompt).toContain("🔁");
    expect(prompt).toContain("Glendale condo");
    expect(prompt).toContain("Buy a house for my parents");
    expect(prompt).toContain("Already achieved: 1");
    expect(prompt).toContain("▲ +$14,000.00");
    expect(prompt).toContain("Answer in English.");
  });

  it("flags a company above my own limit", () => {
    const prompt = buildAiPrompt({ ...data, limits: { ...data.limits, max_position_pct: 0.1 } }, options);
    expect(prompt).toMatch(/\| 📈 ⚠️ \| NVDA \|/);
  });

  it("can round amounts, leave out names, and answer in Armenian", () => {
    const prompt = buildAiPrompt(data, { ...options, amounts: "rounded", names: false, answerIn: "hy", goal: "custom", question: "Should I buy a second rental?" });
    expect(prompt).toContain("Should I buy a second rental?");
    expect(prompt).not.toContain("Glendale condo");
    expect(prompt).not.toContain("Paycheck");
    expect(prompt).not.toContain("Buy a house for my parents");
    expect(prompt).toContain("rounded to the nearest 100");
    expect(prompt).not.toMatch(/\$\d[\d,]*\.\d\d/);
    expect(prompt).toContain("Answer in Armenian");
  });

  it("never includes an email address", () => {
    expect(buildAiPrompt(data, options)).not.toMatch(/@/);
  });
});
