import type { Portfolio } from "@/lib/api";
import { babySteps } from "@/lib/baby-steps";
import { isFund } from "@/lib/analytics";
import {
  FREQUENCIES,
  assetTypeFor,
  buildPlan,
  categoryFor,
  monthlyAmount,
  yearsLabel,
  type FireAsset,
  type FireEntry,
  type FireSettings,
  type FxRates,
} from "@/lib/fire";
import { portfolioSnapshot, type NetWorthPoint, type Quote } from "@/lib/today";

/** What the person wants the other AI to do. */
export type PromptGoal = "review" | "fire" | "risk" | "retirement" | "custom";

export type PromptOptions = {
  goal: PromptGoal;
  /** The person's own question, used with "custom" and added to the others when given. */
  question: string;
  /** Exact amounts, or rounded to the nearest $100 for more privacy. */
  amounts: "exact" | "rounded";
  /** Include the names typed for entries, assets and goals, or only their categories. */
  names: boolean;
  /** Language the other AI should answer in. */
  answerIn: "en" | "hy";
};

export type PromptData = {
  today: string;
  currency: string;
  age: number | null;
  portfolios: Portfolio[];
  quotes: Map<string, Quote>;
  rates: FxRates;
  entries: FireEntry[];
  assets: FireAsset[];
  settings: FireSettings;
  limits: { max_position_pct: number; max_industry_pct?: number; min_cash_pct?: number };
  history: NetWorthPoint[];
  wishes: { list: string; text: string; done: boolean }[];
};

const GOALS: Record<Exclude<PromptGoal, "custom">, string> = {
  review:
    "Give me a full, honest review of my financial situation: what is strong, what is weak, and the most important things to change, in order of impact.",
  fire:
    "Help me reach financial independence (FIRE) sooner: check my FIRE number, savings rate and timeline, and show me the changes that would move my FIRE date the most.",
  risk:
    "Check my risk: concentration in single stocks and sectors, diversification, stocks vs bonds, cash reserves, and anything that could hurt me badly in a market crash or job loss.",
  retirement:
    "Help me use tax-advantaged accounts better (Roth IRA, 401(k), HSA, 529): what to fund first, how much, and how my current accounts fit my age and goals. I live in the United States.",
};

/** The symbols used in the prompt, explained once so any AI reads them the same way. */
export const PROMPT_LEGEND: [string, string][] = [
  ["💼", "investment portfolio"],
  ["📈", "single stock (company)"],
  ["🧺", "fund or ETF (many companies)"],
  ["💵", "cash"],
  ["🏦", "savings account or CD"],
  ["📜", "bond"],
  ["🛡️", "Roth IRA"],
  ["🎓", "529 education account"],
  ["🏠", "property or other owned asset"],
  ["⬆️", "income (money in)"],
  ["⬇️", "expense (money out)"],
  ["🔁", "paid into my own account (saved, not spent)"],
  ["🔥", "FIRE: financial independence, retire early"],
  ["🎯", "personal goal"],
  ["✅", "done"],
  ["⬜", "not done yet"],
  ["⚠️", "above one of my own limits"],
  ["▲ / ▼", "rise / fall"],
];

function frequencyLabel(key: string) {
  return FREQUENCIES.find((item) => item.key === key)?.label.toLowerCase() ?? key;
}

function entryIcon(entry: FireEntry) {
  if (entry.kind === "expense") return categoryFor("expense", entry.category).into ? "🔁" : "⬇️";
  return (
    { savings: "🏦", cd: "🏦", bond: "📜", roth_ira: "🛡️", college_529: "🎓", rent_income: "🏠" }[entry.category] ?? "⬆️"
  );
}

/**
 * A prompt for another AI tool (ChatGPT, Claude, Gemini…) that describes the person's whole
 * financial picture in plain sections and tables, with a legend for every symbol, followed by
 * what they want to know. It is built on the device from data the person already entered;
 * their email and other contact details are never part of it.
 */
export function buildAiPrompt(data: PromptData, options: PromptOptions): string {
  const { today, currency, rates } = data;
  const round = options.amounts === "rounded";
  const format = (value: number, code = currency, signed = false) => {
    const shown = round ? Math.round(value / 100) * 100 : value;
    const text = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: round ? 0 : 2,
      minimumFractionDigits: round ? 0 : 2,
    }).format(Math.abs(shown));
    return `${shown < 0 ? "−" : signed && shown > 0 ? "+" : ""}${text}`;
  };
  const pct = (value: number | null | undefined, digits = 1, signed = false) =>
    value == null || !Number.isFinite(value) ? "—" : `${signed && value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
  const label = (name: string, fallback: string) => (options.names && name.trim() ? name.trim() : fallback);
  const cell = (text: string) => text.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  const push = (...items: string[]) => lines.push(...items);

  const snapshots = data.portfolios.map((portfolio) => portfolioSnapshot(portfolio, data.quotes, rates));
  const investments = snapshots.reduce((sum, item) => sum + item.total, 0);
  const cash = snapshots.reduce((sum, item) => sum + item.cash, 0);
  const holdingsValue = investments - cash;
  const dayChange = snapshots.reduce((sum, item) => sum + item.dayChange, 0);
  const plan = buildPlan({
    entries: data.entries,
    assets: data.assets,
    settings: data.settings,
    portfolioValue: investments,
    today,
    rates,
    baseCurrency: currency,
  });
  const otherAssets = plan.heldAssets.reduce((sum, item) => sum + item.value, 0);
  const netWorth = investments + plan.savingsBalances + plan.bondBalances + otherAssets;

  // 1. Who and what
  push(
    "# 🧭 My financial snapshot, for your analysis",
    "",
    `Exported from MyPortfolioBuddy on ${today}. Amounts are in ${currency} unless another currency is shown${round ? ", rounded to the nearest 100" : ""}. Prices are the latest market closes.`,
    "",
    "## 🎯 What I want from you",
    "",
    options.goal === "custom" ? options.question.trim() || GOALS.review : GOALS[options.goal],
  );
  if (options.goal !== "custom" && options.question.trim()) push("", `My own question: ${options.question.trim()}`);
  push(
    "",
    "How to answer:",
    "- Use only the data below. If something important is missing, say what and ask me before assuming.",
    "- Be specific: quote my numbers, show simple math, and say which assumptions you make.",
    "- End with a short action plan in order of priority: next 30 days, next 6 months, long term.",
    "- Point out risks and trade-offs plainly. I understand this is education, not personal financial advice.",
    `- Answer in ${options.answerIn === "hy" ? "Armenian (Հայերեն)" : "English"}.`,
    "",
    "## 🔑 Symbols used below",
    "",
    PROMPT_LEGEND.map(([symbol, meaning]) => `${symbol} = ${meaning}`).join(" · "),
    "",
  );

  // 2. Profile and limits
  push("## 👤 About me", "");
  push(`- Age: ${data.age ?? "not given"}`);
  push(`- Main currency: ${currency}`);
  push(
    `- My own limits: at most ${pct(data.limits.max_position_pct * 100, 0)} of a portfolio in one company` +
      (data.limits.max_industry_pct ? `, at most ${pct(data.limits.max_industry_pct * 100, 0)} in one sector` : "") +
      `; keep at least ${pct((data.limits.min_cash_pct ?? 0.05) * 100, 0)} in cash.`,
  );
  push("");

  // 3. Net worth
  push("## 📊 Net worth today", "", "| Part | Amount | Share |", "|---|---:|---:|");
  const parts: [string, number][] = [
    ["💼 Investments (holdings)", holdingsValue],
    ["💵 Cash in portfolios", cash],
    ["🏦 Savings, CDs, Roth IRA and 529 balances", plan.savingsBalances],
    ["📜 Bonds (face value)", plan.bondBalances],
    ...plan.heldAssets.map((group): [string, number] => [`🏠 ${group.label}`, group.value]),
  ];
  for (const [name, value] of parts) {
    if (!value) continue;
    push(`| ${name} | ${format(value)} | ${pct(netWorth ? (value / netWorth) * 100 : null)} |`);
  }
  push(`| **Total net worth** | **${format(netWorth)}** | 100% |`, "");
  if (holdingsValue) push(`Markets today moved my holdings by ${format(dayChange, currency, true)}${holdingsValue - dayChange > 0 ? ` (${pct((dayChange / (holdingsValue - dayChange)) * 100, 2, true)})` : ""}.`, "");

  // 4. Portfolios and holdings
  if (data.portfolios.length) push("## 💼 Portfolios and holdings", "");
  const sectors = new Map<string, number>();
  data.portfolios.forEach((portfolio, index) => {
    const snapshot = snapshots[index];
    const own = portfolio.base_currency ?? "USD";
    push(
      `### 💼 ${label(portfolio.name, `Portfolio ${index + 1}`)} (${own})`,
      "",
      `Value ${format(snapshot.total, own)} = holdings ${format(snapshot.holdingsValue, own)} + 💵 cash ${format(snapshot.cash, own)} (${pct(snapshot.total ? (snapshot.cash / snapshot.total) * 100 : null)} cash).`,
      "",
    );
    if (!portfolio.portfolio_positions.length) {
      push("No holdings yet.", "");
      return;
    }
    push(
      "| | Symbol | Name | Sector | Shares | Price | Value | Weight | Avg cost | Gain/loss | Today |",
      "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|",
    );
    const limit = portfolio.max_position_pct ?? data.limits.max_position_pct;
    const rows = portfolio.portfolio_positions
      .map((position) => {
        const ticker = position.ticker.trim().toUpperCase();
        const quote = data.quotes.get(ticker);
        const shares = Number(position.shares) || 0;
        const value = quote?.price == null ? null : quote.price * shares;
        return { position, ticker, quote, shares, value };
      })
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    for (const { position, ticker, quote, shares, value } of rows) {
      const fund = isFund({ ...position, ...quote, shares });
      const weight = value != null && snapshot.total ? value / snapshot.total : null;
      const cost = position.purchase_price == null ? null : Number(position.purchase_price);
      const gain = cost && quote?.price != null ? (quote.price / cost - 1) * 100 : null;
      const flag = !fund && weight != null && weight > limit ? " ⚠️" : "";
      const sector = fund ? "Fund" : quote?.sector || position.sector || "—";
      if (value != null) sectors.set(sector, (sectors.get(sector) ?? 0) + (own === currency ? value : (value * (rates[own] ?? 1))));
      push(
        `| ${fund ? "🧺" : "📈"}${flag} | ${ticker} | ${cell(quote?.company_name || quote?.name || position.company_name || "—")} | ${cell(sector)} | ${shares} | ${quote?.price == null ? "—" : format(quote.price, own)} | ${value == null ? "no price" : format(value, own)} | ${pct(weight == null ? null : weight * 100)} | ${cost == null ? "—" : format(cost, own)} | ${pct(gain, 1, true)} | ${pct(quote?.day_change_percent, 2, true)} |`,
      );
    }
    push("");
  });
  if (sectors.size) {
    const total = [...sectors.values()].reduce((sum, value) => sum + value, 0);
    push(
      "Holdings by sector, all portfolios: " +
        [...sectors.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, value]) => `${name} ${pct(total ? (value / total) * 100 : null)}`)
          .join(" · "),
      "",
    );
  }

  // 5. Accounts (savings, CDs, bonds, retirement)
  const running = data.entries.filter((entry) => !entry.ends_on || entry.ends_on >= today);
  const accounts = running.filter((entry) => entry.kind === "income" && categoryFor("income", entry.category).yields);
  if (accounts.length) {
    push("## 🏦 Savings, bonds and retirement accounts", "", "| | Name | Type | Balance / face value | Rate | Pays | Matures |", "|---|---|---|---:|---:|---|---|");
    for (const entry of accounts) {
      const category = categoryFor("income", entry.category);
      push(
        `| ${entryIcon(entry)} | ${cell(label(entry.name, category.label))} | ${category.label} | ${format(Number(entry.principal) || 0, entry.currency)} | ${pct(entry.yield_pct, 2)}${category.growth ? " expected return" : category.yields === "face" ? " coupon" : " APY"} | ${frequencyLabel(entry.frequency)} | ${entry.ends_on ?? "—"} |`,
      );
    }
    push("");
  }

  // 6. Property and other assets
  if (data.assets.length) {
    push("## 🏠 Property and other assets", "", "| Name | Type | Market value |", "|---|---|---:|");
    for (const asset of data.assets) {
      const type = assetTypeFor(asset.asset_type).label;
      push(`| ${cell(label(asset.name, type))} | ${type} | ${asset.market_value == null ? "—" : format(Number(asset.market_value), asset.currency)} |`);
    }
    push("");
  }

  // 7. Cash flow
  const flowRows = (kind: "income" | "expense") =>
    running
      .filter((entry) => entry.kind === kind && !(kind === "income" && categoryFor("income", entry.category).yields))
      .map((entry) => ({ entry, monthly: monthlyAmount(entry, today, rates, currency) }))
      .sort((a, b) => b.monthly - a.monthly);
  const income = flowRows("income");
  const expenses = flowRows("expense");
  if (income.length || expenses.length) {
    push("## ⬆️⬇️ Income and expenses", "", "| | Name | Category | Amount | How often | Per month | Ends |", "|---|---|---|---:|---|---:|---|");
    for (const { entry, monthly } of [...income, ...expenses]) {
      const category = categoryFor(entry.kind, entry.category);
      push(
        `| ${entryIcon(entry)} | ${cell(label(entry.name, category.label))} | ${category.label} | ${format(Number(entry.amount) || 0, entry.currency)} | ${frequencyLabel(entry.frequency)} | ${entry.frequency === "once" ? `once on ${entry.starts_on}` : format(monthly)} | ${entry.ends_on ?? "—"} |`,
      );
    }
    push(
      "",
      `Per month: ⬆️ income ${format(plan.monthlyIncome)} (including interest and coupons) · ⬇️ expenses ${format(plan.monthlyExpenses)}${plan.monthlyContributions ? `, of which 🔁 ${format(plan.monthlyContributions)} goes into my own accounts` : ""} · left over ${format(plan.monthlyNet, currency, true)} · savings rate ${pct(plan.savingsRate == null ? null : plan.savingsRate * 100)}.`,
      "",
    );
  }

  // 8. FIRE
  push("## 🔥 My FIRE plan", "");
  if (plan.fireNumber) {
    push(
      `- Yearly spending in retirement: ${format(plan.annualSpend)}; safe withdrawal rate ${pct(data.settings.withdrawal_rate_pct, 1)} → FIRE number ${format(plan.fireNumber)}.`,
      `- Assets counted today: ${format(plan.currentAssets)} → ${pct((plan.currentAssets / plan.fireNumber) * 100)} of the way.`,
      `- Investing about ${format(plan.monthlyInvest)} a month at ${pct(data.settings.expected_return_pct, 1)} expected return${data.settings.inflation_pct ? ` and ${pct(data.settings.inflation_pct, 1)} inflation` : ""}: FIRE in about ${yearsLabel(plan.hitMonth)}.`,
    );
  } else {
    push("- No FIRE number yet: no expenses or retirement spending entered.");
  }
  push("");

  // 9. Baby steps
  const steps = babySteps({
    entries: data.entries,
    today,
    rates,
    baseCurrency: currency,
    stocks: holdingsValue,
    bonds: plan.bondBalances,
    age: data.age,
  });
  push("## ✅ My money to-do list (baby steps)", "");
  for (const step of steps) {
    const mark = step.done ? "✅" : "⬜";
    if (step.key === "emergency")
      push(`- ${mark} Emergency fund: ${format(step.have)} in savings and CDs = ${step.months.toFixed(1)} months of expenses (+30%); target 3–6 months.`);
    else if (step.key === "roth")
      push(`- ${mark} 🛡️ Roth IRA: ${step.accounts ? `balance ${format(step.have)}, ` : "no account yet, "}contributions planned for ${step.year}: ${format(step.contributions)} of the ${format(step.limit, "USD")} limit.`);
    else if (step.key === "invest")
      push(`- ${mark} Stocks and bonds: stocks ${format(step.stocks)}, bonds ${format(step.bonds)}.`);
    else push(`- ${mark} 🎓 529 education account: ${step.accounts ? format(step.have) : "none"}.`);
  }
  push("");

  // 10. Net worth history
  const points = [...data.history].sort((a, b) => a.day.localeCompare(b.day));
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    const change = Number(last.total) - Number(first.total);
    push(
      "## 📈 Net worth over time",
      "",
      `From ${first.day} (${format(Number(first.total))}) to ${last.day} (${format(Number(last.total))}): ${change >= 0 ? "▲" : "▼"} ${format(change, currency, true)} over ${points.length} saved days.`,
      "",
    );
  }

  // 11. Goals
  const open = data.wishes.filter((wish) => !wish.done);
  if (open.length) {
    push("## 🎯 My goals (my vision)", "");
    const lists: [string, string][] = [
      ["short", "Within 1 year"],
      ["long", "1–5 years"],
      ["want", "Anytime"],
    ];
    for (const [key, horizon] of lists) {
      const items = open.filter((wish) => wish.list === key);
      if (!items.length) continue;
      push(
        options.names
          ? `- ${horizon}: ${items.slice(0, 12).map((wish) => cell(wish.text)).join("; ")}${items.length > 12 ? ` (+${items.length - 12} more)` : ""}`
          : `- ${horizon}: ${items.length} goal${items.length === 1 ? "" : "s"}`,
      );
    }
    const done = data.wishes.length - open.length;
    if (done) push(`- Already achieved: ${done}`);
    push("");
  }

  push("---", "Please start with a 3-sentence summary of my situation, then answer what I asked above.");
  return lines.join("\n");
}
