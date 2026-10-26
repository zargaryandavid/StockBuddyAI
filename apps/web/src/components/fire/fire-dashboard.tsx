"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  Car,
  ChartLine,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileSignature,
  FileText,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Info,
  KeyRound,
  Landmark,
  Laptop,
  PartyPopper,
  Pencil,
  ChartColumn,
  PieChart,
  PiggyBank,
  Plane,
  Plus,
  Receipt,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import { api } from "@/lib/api";
import {
  ASSET_TYPES,
  EXPENSE_CATEGORIES,
  FREQUENCIES,
  INCOME_CATEGORIES,
  assetMix,
  assetTypeFor,
  buildPlan,
  categoryFor,
  monthEvents,
  monthlyAmount,
  occurrences,
  planNotes,
  yearsLabel,
  yieldPayment,
  type AssetSlice,
  type CalendarEvent,
  type FireAsset,
  type FireAssetType,
  type FireEntry,
  type FireFrequency,
  type FireKind,
  type FireSettings,
  type FxRates,
} from "@/lib/fire";
import { cleanNumberInput } from "@/lib/inputs";
import { money } from "@/lib/portfolio-metrics";

import { breakdown, currencyView, forPeriod, periodSuffix, type Period } from "@/lib/fire-views";

import { BreakdownDialog } from "./breakdown-dialog";
import { TimelineDialog } from "./timeline-dialog";
import { DonutRing } from "./donut";
import { FireProgressPanel } from "./fire-progress";
import { ProjectionChart } from "./projection-chart";

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  "building-2": Building2,
  car: Car,
  "chart-line": ChartLine,
  ellipsis: Ellipsis,
  "file-signature": FileSignature,
  "file-text": FileText,
  gift: Gift,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  home: Home,
  "key-round": KeyRound,
  landmark: Landmark,
  laptop: Laptop,
  "party-popper": PartyPopper,
  "piggy-bank": PiggyBank,
  plane: Plane,
  plus: Plus,
  receipt: Receipt,
  "scroll-text": ScrollText,
  "shield-check": ShieldCheck,
  "shopping-bag": ShoppingBag,
  "trending-up": TrendingUp,
  utensils: Utensils,
};

function CategoryIcon({ name, size = 16 }: { name: string; size?: number }) {
  return createElement(ICONS[name] ?? Ellipsis, { size, "aria-hidden": true });
}

const DEFAULT_SETTINGS: FireSettings = {
  expected_return_pct: 7,
  retirement_annual_spend: null,
  monthly_invest: null,
  withdrawal_rate_pct: 4,
  inflation_pct: 3,
};

const CURRENCIES = ["USD", "AMD", "EUR", "GBP", "RUB", "CAD", "CHF", "JPY"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Draft = {
  id: string | null;
  kind: FireKind;
  currency: string;
  category: string;
  name: string;
  amount: string;
  frequency: FireFrequency;
  starts_on: string;
  ends_on: string;
  principal: string;
  yield_pct: string;
  quantity: string;
  unit_price: string;
  note: string;
  /** Rental income: an existing asset's id, or "new" to create one from this entry. */
  asset_id: string;
  asset_type: FireAssetType;
  market_value: string;
};

function newDraft(kind: FireKind, today: string, currency: string): Draft {
  return {
    id: null,
    kind,
    currency,
    category: kind === "income" ? "salary" : "rent",
    name: "",
    amount: "",
    frequency: "monthly",
    starts_on: today,
    ends_on: "",
    principal: "",
    yield_pct: "",
    quantity: "",
    unit_price: "",
    note: "",
    asset_id: "new",
    asset_type: "residential",
    market_value: "",
  };
}

function draftFrom(entry: FireEntry): Draft {
  return {
    id: entry.id,
    kind: entry.kind,
    currency: entry.currency || "USD",
    category: entry.category,
    name: entry.name,
    amount: String(entry.amount),
    frequency: entry.frequency,
    starts_on: entry.starts_on.slice(0, 10),
    ends_on: entry.ends_on?.slice(0, 10) ?? "",
    principal: entry.principal == null ? "" : String(entry.principal),
    yield_pct: entry.yield_pct == null ? "" : String(entry.yield_pct),
    quantity: entry.quantity == null ? "" : String(Number(entry.quantity)),
    unit_price: entry.unit_price == null ? "" : String(Number(entry.unit_price)),
    note: entry.note ?? "",
    asset_id: entry.asset_id ?? "new",
    asset_type: "residential",
    // An older rental kept its property value on the entry; it moves to the new asset.
    market_value: entry.category === "rent_income" && entry.principal != null ? String(entry.principal) : "",
  };
}

/** Balance, face value (quantity × price per bond), or property value; null if not given. */
function draftPrincipal(draft: Draft): number | null {
  const category = categoryFor(draft.kind, draft.category);
  if (category.yields === "face") {
    if (draft.quantity === "" || draft.unit_price === "") return null;
    return Math.round(Number(draft.quantity) * Number(draft.unit_price) * 100) / 100;
  }
  return draft.principal === "" ? null : Number(draft.principal);
}

/** The first problem with a draft, worded for the person filling in the form. */
export function draftProblem(draft: Draft): string | null {
  const category = categoryFor(draft.kind, draft.category);
  if (!draft.name.trim()) return "Give the entry a name.";
  if (category.yields === "face") {
    if (draft.quantity === "" || !(Number(draft.quantity) > 0)) {
      return "Enter how many bonds you hold.";
    }
    if (draft.unit_price === "" || !(Number(draft.unit_price) > 0)) {
      return "Enter the price of one bond.";
    }
  }
  if (
    category.rental &&
    draft.asset_id === "new" &&
    draft.market_value !== "" &&
    !(Number(draft.market_value) >= 0)
  ) {
    return "Enter the market value (zero or more), or leave it blank.";
  }
  if (category.yields) {
    if (category.yields === "balance" && (draft.principal === "" || !(Number(draft.principal) >= 0))) {
      return "Enter the balance (zero or more).";
    }
    const rate = Number(draft.yield_pct);
    if (draft.yield_pct === "" || !(rate >= 0 && rate <= 100)) {
      return "Enter a rate between 0% and 100%.";
    }
  } else if (draft.amount === "" || !(Number(draft.amount) >= 0)) {
    return "Enter an amount of zero or more.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.starts_on)) {
    return draft.frequency === "once" ? "Pick the date." : "Pick the first date.";
  }
  if (draft.frequency !== "once") {
    if (category.key === "bond" && !draft.ends_on) return "Pick the maturity date.";
    if (draft.ends_on && !/^\d{4}-\d{2}-\d{2}$/.test(draft.ends_on)) {
      return "The end date is incomplete. Pick it again.";
    }
    if (draft.ends_on && draft.ends_on < draft.starts_on) {
      const what = category.key === "bond" ? "maturity date" : "end date";
      return `The ${what} (${draft.ends_on}) is before the first date (${draft.starts_on}). Move the first date earlier or fix the ${what}.`;
    }
  }
  return null;
}

function nextDate(entry: FireEntry, today: string) {
  return occurrences(entry, today, "2100-12-31")[0] ?? null;
}

function frequencyLabel(frequency: FireFrequency) {
  return FREQUENCIES.find((item) => item.key === frequency)?.label ?? frequency;
}

export function FireDashboard({
  portfolioValue,
  cash,
  reports,
  today,
  currency = "USD",
  dateOfBirth = null,
  onEditProfile,
}: {
  portfolioValue: number;
  cash: number;
  reports: { ticker: string; report_date: string }[];
  today: string;
  currency?: string;
  /** From the user's profile; ages are hidden without it. */
  dateOfBirth?: string | null;
  onEditProfile?: () => void;
}) {
  const [entries, setEntries] = useState<FireEntry[]>([]);
  const [assets, setAssets] = useState<FireAsset[]>([]);
  const [settings, setSettings] = useState<FireSettings>(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<FireSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [period, setPeriod] = useState<Period>("monthly");
  const [breakdownFor, setBreakdownFor] = useState<"income" | "expense" | null>(null);
  const [timelineFor, setTimelineFor] = useState<"income" | "expense" | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }));
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
  const [rates, setRates] = useState<FxRates>({});
  // Which currencies the current rates were fetched for; until this matches, rates are
  // still loading and a missing rate is not an error yet.
  const [ratesFor, setRatesFor] = useState("");
  const foreignCurrencies = useMemo(
    () =>
      [
        ...new Set(
          [...entries, ...assets]
            .map((item) => item.currency)
            .filter((code) => code && code !== currency),
        ),
      ]
        .sort()
        .join(","),
    [entries, assets, currency],
  );

  useEffect(() => {
    if (!foreignCurrencies) return;
    let active = true;
    Promise.allSettled(
      foreignCurrencies.split(",").map((code) =>
        api<{ rate: number }>(
          `/api/fx?from=${encodeURIComponent(code)}&to=${encodeURIComponent(currency)}`,
        ).then((result) => [code, result.rate] as const),
      ),
    ).then((results) => {
      if (!active) return;
      const next: FxRates = {};
      for (const result of results) {
        if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
      }
      setRates(next);
      setRatesFor(foreignCurrencies);
    });
    return () => {
      active = false;
    };
  }, [foreignCurrencies, currency]);
  const ratesLoading = Boolean(foreignCurrencies) && ratesFor !== foreignCurrencies;

  useEffect(() => {
    let active = true;
    // Assets load on their own so the rest of the plan still shows if they cannot.
    api<FireAsset[]>("/api/fire/assets")
      .then((rows) => {
        if (active) setAssets(Array.isArray(rows) ? rows : []);
      })
      .catch(() => undefined);
    Promise.all([
      api<FireEntry[]>("/api/fire/entries"),
      api<FireSettings>("/api/fire/settings"),
    ])
      .then(([rows, saved]) => {
        if (!active) return;
        setEntries(rows ?? []);
        const merged = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
        setSettings(merged);
        setSettingsDraft(merged);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load your FIRE plan");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // The chart and totals follow what is typed in the assumptions right away, before it is
  // saved; a value that is out of range falls back to the saved one.
  const previewSettings = useMemo<FireSettings>(() => {
    const ret = settingsDraft.expected_return_pct;
    const withdrawal = settingsDraft.withdrawal_rate_pct;
    const inflation = Number(settingsDraft.inflation_pct);
    return {
      ...settingsDraft,
      inflation_pct:
        Number.isFinite(inflation) && inflation >= -5 && inflation <= 20
          ? inflation
          : (settings.inflation_pct ?? 3),
      expected_return_pct:
        Number.isFinite(ret) && ret >= -50 && ret <= 50 ? ret : settings.expected_return_pct,
      withdrawal_rate_pct:
        Number.isFinite(withdrawal) && withdrawal >= 1 && withdrawal <= 10
          ? withdrawal
          : settings.withdrawal_rate_pct,
    };
  }, [settingsDraft, settings]);

  const plan = useMemo(
    () =>
      buildPlan({
        entries,
        assets,
        settings: previewSettings,
        portfolioValue,
        today,
        rates,
        baseCurrency: currency,
      }),
    [entries, assets, previewSettings, portfolioValue, today, rates, currency],
  );
  const notes = useMemo(() => planNotes(plan, cash), [plan, cash]);
  const events = useMemo(
    () => monthEvents({ entries, reports, ...calendarMonth, rates, baseCurrency: currency }),
    [entries, reports, calendarMonth, rates, currency],
  );

  async function saveEntry() {
    if (!draft) return;
    const category = categoryFor(draft.kind, draft.category);
    const principal = draftPrincipal(draft);
    const yieldPct = draft.yield_pct === "" ? null : Number(draft.yield_pct);
    const amount =
      category.yields && principal != null && yieldPct != null
        ? yieldPayment(principal, yieldPct, draft.frequency)
        : Number(draft.amount);
    const problem = draftProblem(draft);
    if (problem) {
      setDialogError(problem);
      return;
    }
    setSaving(true);
    setDialogError(null);
    const body = JSON.stringify({
      kind: draft.kind,
      category: draft.category,
      name: draft.name,
      amount,
      currency: draft.currency,
      frequency: draft.frequency,
      starts_on: draft.starts_on,
      ends_on: draft.ends_on || null,
      principal: category.yields ? principal : null,
      yield_pct: category.yields ? yieldPct : null,
      quantity: category.yields === "face" ? Number(draft.quantity) : null,
      unit_price: category.yields === "face" ? Number(draft.unit_price) : null,
      note: draft.note.trim() || null,
      asset_id: category.rental && draft.asset_id !== "new" ? draft.asset_id : null,
      new_asset:
        category.rental && draft.asset_id === "new"
          ? {
              asset_type: draft.asset_type,
              name: draft.name.trim(),
              market_value: draft.market_value === "" ? null : Number(draft.market_value),
              currency: draft.currency,
            }
          : null,
    });
    try {
      const saved = await api<FireEntry>(
        draft.id ? `/api/fire/entries/${draft.id}` : "/api/fire/entries",
        { method: draft.id ? "PUT" : "POST", body },
      );
      setEntries((current) =>
        draft.id
          ? current.map((item) => (item.id === draft.id ? { ...item, ...saved } : item))
          : [...current, saved],
      );
      setDraft(null);
      if (category.rental && draft.asset_id === "new") await loadAssets();
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : "Could not save the entry");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entry: FireEntry) {
    setError(null);
    try {
      await api(`/api/fire/entries/${entry.id}`, { method: "DELETE" });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the entry");
    }
  }

  async function loadAssets() {
    const rows = await api<FireAsset[]>("/api/fire/assets");
    setAssets(Array.isArray(rows) ? rows : []);
  }

  async function saveSettings() {
    setError(null);
    try {
      const saved = await api<FireSettings>("/api/fire/settings", {
        method: "PUT",
        body: JSON.stringify(settingsDraft),
      });
      const merged = { ...DEFAULT_SETTINGS, ...saved };
      setSettings(merged);
      setSettingsDraft(merged);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your assumptions");
    }
  }

  function shiftMonth(delta: number) {
    setCalendarMonth(({ year, month }) => {
      const next = new Date(Date.UTC(year, month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
    setSelectedDay(null);
  }

  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(settingsDraft);
  const monthIncome = events
    .filter((event) => event.kind === "income")
    .reduce((total, event) => total + Number(event.baseAmount ?? 0), 0);
  const monthExpense = events
    .filter((event) => event.kind === "expense")
    .reduce((total, event) => total + Number(event.baseAmount ?? 0), 0);

  return (
    <section className="fire-page" aria-labelledby="fire-title">
      <header className="fire-heading">
        <div>
          <div className="fire-title-row">
            <h1 id="fire-title">FIRE plan</h1>
            <InfoButton
              label="What is FIRE and how is it calculated?"
              onClick={() => setShowInfo(true)}
            />
          </div>
          <p className="page-subtitle">
            Track what comes in and goes out, and see when your savings can pay for your life.
            Estimates, not advice.
          </p>
        </div>
      </header>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {!loading && !ratesLoading && plan.missingRates.length > 0 && (
        <p className="alert" role="status">
          No exchange rate is available for {plan.missingRates.join(", ")} yet, so those
          entries are left out of the totals.
        </p>
      )}

      <div className="segmented fire-period" role="group" aria-label="Show amounts">
        {(["monthly", "annual"] as const).map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={period === option}
            className={period === option ? "active" : ""}
            onClick={() => setPeriod(option)}
          >
            {option === "monthly" ? "Monthly" : "Annual"}
          </button>
        ))}
      </div>

      <section className="portfolio-summary-grid" aria-label="FIRE summary">
        <SummaryTile
          label={period === "annual" ? "Annual income" : "Monthly income"}
          value={money(forPeriod(plan.monthlyIncome, period), currency)}
          tone="positive"
        />
        <SummaryTile
          label={period === "annual" ? "Annual expenses" : "Monthly expenses"}
          value={money(forPeriod(plan.monthlyExpenses, period), currency)}
          tone="negative"
        />
        <SummaryTile
          label={period === "annual" ? "Left over each year" : "Left over each month"}
          value={money(forPeriod(plan.monthlyNet, period), currency)}
          tone={plan.monthlyNet >= 0 ? "positive" : "negative"}
        />
        <SummaryTile
          label="Savings rate"
          value={plan.savingsRate == null ? "—" : `${(plan.savingsRate * 100).toFixed(1)}%`}
        />
        <SummaryTile
          label="Current assets"
          value={money(plan.currentAssets, currency)}
          note="Portfolio + savings"
        />
        <SummaryTile
          label="FIRE number"
          value={plan.fireNumber ? money(plan.fireNumber, currency) : "—"}
          note={`${Math.round(100 / previewSettings.withdrawal_rate_pct)}× yearly spending`}
        />
        <SummaryTile label="Time to FIRE" value={plan.fireNumber ? yearsLabel(plan.hitMonth) : "—"} />
      </section>


      <div className="fire-columns">
        {(["income", "expense"] as const).map((kind) => {
          const rows = entries.filter((entry) => entry.kind === kind);
          return (
            <section className="panel fire-list" key={kind} aria-labelledby={`fire-${kind}-title`}>
              <div className="fire-list-heading">
                <div className="fire-list-title">
                  <h2 id={`fire-${kind}-title`}>{kind === "income" ? "Incomes" : "Expenses"}</h2>
                  <span className="fire-list-count">
                    {rows.length} {rows.length === 1 ? "source" : "sources"}
                  </span>
                  <strong
                    className={`fire-list-total ${kind}`}
                    title="Every repeating entry converted to a monthly amount, whatever its payment cycle. One-time and finished entries are not included."
                  >
                    {money(
                      forPeriod(kind === "income" ? plan.monthlyIncome : plan.monthlyExpenses, period),
                      currency,
                    )}
                    {periodSuffix(period)}
                  </strong>
                  <button
                    type="button"
                    className="fire-pie-button"
                    aria-label={`${period === "annual" ? "Annual" : "Monthly"} ${kind === "income" ? "income" : "expense"} breakdown`}
                    title={`${kind === "income" ? "Income" : "Expense"} breakdown`}
                    onClick={() => setBreakdownFor(kind)}
                  >
                    <PieChart size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="fire-pie-button"
                    aria-label={`${kind === "income" ? "Income" : "Expenses"} by week or month`}
                    title={`${kind === "income" ? "Income" : "Expenses"} by week or month`}
                    onClick={() => setTimelineFor(kind)}
                  >
                    <ChartColumn size={16} aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  className="button primary fire-add"
                  onClick={() => setDraft(newDraft(kind, today, currency))}
                >
                  <Plus size={15} aria-hidden="true" />
                  {kind === "income" ? "Add income" : "Add expense"}
                </button>
              </div>
              {loading ? (
                <p className="muted">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="muted">
                  {kind === "income"
                    ? "Add salary, rental income, savings accounts, bonds, and other income."
                    : "Add rent, bills, insurance, and anything you plan to pay, with when it's due."}
                </p>
              ) : (
                <ul>
                  {rows.map((entry) => {
                    const category = categoryFor(entry.kind, entry.category);
                    const next = nextDate(entry, today);
                    const monthly = monthlyAmount(entry, today, rates, currency);
                    const foreign = entry.currency && entry.currency !== currency;
                    return (
                      <li key={entry.id} className={`fire-entry ${entry.kind}`}>
                        <span className="fire-entry-icon">
                          <CategoryIcon name={category.icon} />
                        </span>
                        <div className="fire-entry-main">
                          <strong>{entry.name}</strong>
                          <span>
                            {category.label} · {frequencyLabel(entry.frequency)}
                            {entry.quantity != null && entry.unit_price != null
                              ? ` · ${Number(entry.quantity).toLocaleString("en-US")} × ${money(Number(entry.unit_price), entry.currency)} = ${money(Number(entry.principal ?? 0), entry.currency)} at ${entry.yield_pct}%`
                              : entry.principal != null && entry.yield_pct != null
                              ? ` · ${money(entry.principal, entry.currency)} at ${entry.yield_pct}%`
                              : category.rental && entry.asset_id
                              ? (() => {
                                  const asset = assets.find((item) => item.id === entry.asset_id);
                                  return asset ? ` · ${assetTypeFor(asset.asset_type).label}: ${asset.name}` : "";
                                })()
                              : ""}
                            {next ? ` · next ${next}` : " · finished"}
                            {entry.ends_on && entry.category === "bond" ? ` · matures ${entry.ends_on}` : ""}
                          </span>
                        </div>
                        <div className="fire-entry-amount">
                          {!foreign && (
                            <strong>
                              {entry.kind === "income" ? "+" : "−"}
                              {money(Number(entry.amount), entry.currency)}
                            </strong>
                          )}
                          {foreign ? (
                            <ForeignAmount entry={entry} today={today} rates={rates} currency={currency} period={period} loadingRate={ratesLoading} />
                          ) : (
                            monthly > 0 &&
                            (entry.frequency !== "monthly" || period === "annual") && (
                              <span>
                                ≈ {money(forPeriod(monthly, period), currency)}
                                {periodSuffix(period)}
                              </span>
                            )
                          )}
                        </div>
                        <div className="fire-entry-actions">
                          <button
                            type="button"
                            aria-label={`Edit ${entry.name}`}
                            onClick={() => setDraft(draftFrom(entry))}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${entry.name}`}
                            onClick={() => void removeEntry(entry)}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className="panel fire-projection" aria-labelledby="fire-projection-title">
        <div className="fire-title-row">
          <h2 id="fire-projection-title">Path to FIRE</h2>
          <InfoButton
            label="How is the path to FIRE calculated?"
            onClick={() => setShowInfo(true)}
          />
        </div>
        <div className="fire-assumptions">
          <label>
            Expected yearly return (%)
            <input
              type="number"
              step="0.1"
              value={settingsDraft.expected_return_pct}
              onChange={(event) =>
                setSettingsDraft((current) => ({
                  ...current,
                  expected_return_pct: Number(cleanNumberInput(event.target)),
                }))
              }
            />
          </label>
          <AutoNumberField
            label="Invest each month"
            value={settingsDraft.monthly_invest}
            autoValue={plan.autoInvest}
            autoNote="Income − expenses, excl. interest"
            resetLabel="Use income minus expenses"
            onChange={(next) =>
              setSettingsDraft((current) => ({ ...current, monthly_invest: next }))
            }
          />
          <AutoNumberField
            label="Yearly spending in retirement"
            value={settingsDraft.retirement_annual_spend}
            autoValue={plan.monthlyExpenses * 12}
            autoNote="Current expenses × 12"
            resetLabel="Use current expenses"
            onChange={(next) =>
              setSettingsDraft((current) => ({ ...current, retirement_annual_spend: next }))
            }
          />
          <div className="fire-auto-field">
            <label>
              Safe withdrawal rate (%)
              <input
                type="number"
                min="1"
                max="10"
                step="0.1"
                value={settingsDraft.withdrawal_rate_pct}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    withdrawal_rate_pct: Number(cleanNumberInput(event.target)),
                  }))
                }
              />
            </label>
            {previewSettings.withdrawal_rate_pct > 4.5 ? (
              <small className="fire-rate-warning" role="alert">
                Above 4.5% is risky. 4% is the usual safe rate.
              </small>
            ) : (
              <small className="fire-auto-note">4% is the usual safe rate.</small>
            )}
          </div>
          <div className="fire-auto-field">
            <label>
              Inflation (%)
              <input
                type="number"
                min="-5"
                max="20"
                step="0.1"
                value={settingsDraft.inflation_pct ?? 3}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    inflation_pct: Number(cleanNumberInput(event.target)),
                  }))
                }
              />
            </label>
            <small className="fire-auto-note">Results are in today&apos;s dollars.</small>
          </div>
          <div className="fire-save-assumptions">
            <button
              type="button"
              className="button primary"
              disabled={!settingsDirty}
              onClick={() => void saveSettings()}
            >
              Save assumptions
            </button>
            {settingsDirty && (
              <small className="fire-unsaved" role="status">
                Unsaved: the chart already shows these numbers
              </small>
            )}
          </div>
        </div>
        <p className="muted fire-assets-note">
          Current assets {money(plan.currentAssets, currency)} = portfolio{" "}
          {money(portfolioValue, currency)} + savings, CDs and bonds{" "}
          {money(plan.yieldBalances, currency)}. Fields marked Auto follow your entries until
          you change them.
        </p>
        <div className="fire-visuals">
          <ProjectionChart plan={plan} currency={currency} today={today} />
          <AssetDonut
            slices={assetMix({
              portfolioValue,
              cash,
              savingsBalances: plan.savingsBalances,
              bondBalances: plan.bondBalances,
              held: plan.heldAssets,
            })}
            growth={{
              stocks: `${formatRate(previewSettings.expected_return_pct)} expected return`,
              cash: `${formatRate(previewSettings.expected_return_pct)}, grows with stocks`,
              bonds:
                plan.bondYieldPct == null ? "" : `${formatRate(plan.bondYieldPct)} avg coupon`,
              savings:
                plan.savingsYieldPct == null ? "" : `${formatRate(plan.savingsYieldPct)} avg APY`,
              real_estate: "Not in FIRE assets",
              vehicles_equipment: "Not in FIRE assets",
              other_assets: "Not in FIRE assets",
            }}
            currency={currency}
          />
        </div>
        <ul className="fire-notes">
          {notes.map((note) => (
            <li key={note.title} className={note.tone ? `fire-note-${note.tone}` : undefined}>
              <strong>{note.title}:</strong> {note.text}
            </li>
          ))}
        </ul>
      </section>

      <FireProgressPanel
        currentAssets={plan.currentAssets}
        fireTarget={plan.fireNumber}
        hitMonth={plan.hitMonth}
        today={today}
        dateOfBirth={dateOfBirth}
        currency={currency}
        onEditProfile={onEditProfile}
      />

      <section className="panel fire-calendar" aria-labelledby="fire-calendar-title">
        <div className="fire-calendar-heading">
          <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 id="fire-calendar-title">
            {MONTHS[calendarMonth.month]} {calendarMonth.year}
          </h2>
          <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <div className="fire-calendar-totals">
            <span className="positive">In {money(monthIncome, currency)}</span>
            <span className="negative">Out {money(monthExpense, currency)}</span>
          </div>
        </div>
        <div className="fire-legend" aria-hidden="true">
          <span className="legend-income">Income</span>
          <span className="legend-expense">Expense</span>
          <span className="legend-report">Report date (est. = estimated)</span>
        </div>
        <MonthGrid
          {...calendarMonth}
          events={events}
          today={today}
          selected={selectedDay}
          onSelect={setSelectedDay}
          currency={currency}
        />
        {selectedDay && (
          <div className="fire-day-detail" aria-live="polite">
            <h3>{selectedDay}</h3>
            {events.filter((event) => event.date === selectedDay).length === 0 ? (
              <p className="muted">Nothing scheduled.</p>
            ) : (
              <ul>
                {events
                  .filter((event) => event.date === selectedDay)
                  .map((event, index) => (
                    <li key={`${event.title}-${index}`} className={`fire-${event.kind}`}>
                      <span>{event.title}</span>
                      {event.amount != null && (
                        <strong>
                          {event.kind === "income" ? "+" : "−"}
                          {money(event.amount, event.currency ?? currency)}
                        </strong>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {breakdownFor && (
        <BreakdownDialog
          kind={breakdownFor}
          data={breakdown(entries, breakdownFor, today, rates, currency)}
          period={period}
          currency={currency}
          onClose={() => setBreakdownFor(null)}
        />
      )}

      {timelineFor && (
        <TimelineDialog
          kind={timelineFor}
          entries={entries}
          today={today}
          rates={rates}
          currency={currency}
          onClose={() => setTimelineFor(null)}
        />
      )}

      {showInfo && (
        <FireInfoDialog
          plan={plan}
          settings={previewSettings}
          portfolioValue={portfolioValue}
          currency={currency}
          onClose={() => setShowInfo(false)}
        />
      )}

      {draft && (
        <EntryDialog
          draft={draft}
          assets={assets}
          saving={saving}
          error={dialogError}
          onChange={(next) => {
            setDraft(next);
            setDialogError(null);
          }}
          onClose={() => {
            setDraft(null);
            setDialogError(null);
          }}
          onSave={() => void saveEntry()}
        />
      )}
    </section>
  );
}

function SummaryTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <article className={`summary-card ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function MonthGrid({
  year,
  month,
  events,
  today,
  selected,
  onSelect,
  currency,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  today: string;
  selected: string | null;
  onSelect: (day: string) => void;
  currency: string;
}) {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const blanks = first.getUTCDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: days }, (_, index) =>
      new Date(Date.UTC(year, month, index + 1)).toISOString().slice(0, 10),
    ),
  ];
  return (
    <div className="fire-month" role="grid" aria-label="Month calendar">
      {WEEKDAYS.map((day) => (
        <span key={day} className="fire-weekday" role="columnheader">
          {day}
        </span>
      ))}
      {cells.map((day, index) => {
        if (!day) return <span key={`blank-${index}`} className="fire-day blank" />;
        const dayEvents = events.filter((event) => event.date === day);
        return (
          <button
            type="button"
            key={day}
            role="gridcell"
            className={`fire-day${day === today ? " today" : ""}${day === selected ? " selected" : ""}`}
            aria-label={`${day}: ${dayEvents.length} item${dayEvents.length === 1 ? "" : "s"}`}
            onClick={() => onSelect(day)}
          >
            <span className="fire-day-number">{Number(day.slice(8))}</span>
            {dayEvents.slice(0, 3).map((event, eventIndex) => (
              <span key={eventIndex} className={`fire-chip fire-${event.kind}`} title={event.title}>
                {event.amount != null
                  ? `${event.kind === "income" ? "+" : "−"}${money(event.amount, event.currency ?? currency)} ${event.title}`
                  : event.title}
              </span>
            ))}
            {dayEvents.length > 3 && (
              <span className="fire-more">+{dayEvents.length - 3} more</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A non-base-currency entry: its own amount and cadence, converted totals, and the rate. */
function ForeignAmount({
  entry,
  today,
  rates,
  currency,
  period,
  loadingRate = false,
}: {
  entry: FireEntry;
  today: string;
  rates: FxRates;
  currency: string;
  period: Period;
  loadingRate?: boolean;
}) {
  const view = currencyView(entry, today, rates, currency);
  const heading = (
    <strong>
      {entry.kind === "income" ? "+" : "−"}
      {money(view.amount, view.currency)} {view.cadence}
    </strong>
  );
  if (view.basePerPayment == null) {
    return (
      <span className="fire-foreign">
        {heading}
        <span>{loadingRate ? "Converting…" : `No ${view.currency} exchange rate yet`}</span>
      </span>
    );
  }
  return (
    <span className="fire-foreign">
      {heading}
      <span>≈ {money(view.basePerPayment, currency)} total</span>
      {view.baseMonthly != null && view.baseMonthly > 0 && (
        <span>
          ≈ {money(forPeriod(view.baseMonthly, period), currency)}/{period === "annual" ? "year" : "month"}
        </span>
      )}
      {view.unitsPerBase != null && (
        <span>
          (1 {currency} = {view.unitsPerBase.toLocaleString("en-US", { maximumFractionDigits: view.unitsPerBase >= 100 ? 0 : 2 })}{" "}
          {view.currency})
        </span>
      )}
    </span>
  );
}

/** Round ⓘ button that opens the "What is FIRE?" explanation. */
function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="fire-info-button" aria-label={label} title={label} onClick={onClick}>
      <Info size={18} aria-hidden="true" />
    </button>
  );
}

/** Plain-language explanation of FIRE and of each number on the page, using the user's figures. */
function FireInfoDialog({
  plan,
  settings,
  portfolioValue,
  currency,
  onClose,
}: {
  plan: ReturnType<typeof buildPlan>;
  settings: FireSettings;
  portfolioValue: number;
  currency: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const m = (value: number) => money(value, currency).replace(/\.\d{2}$/, "");
  const rate = settings.withdrawal_rate_pct;
  const multiple = Math.round((100 / rate) * 10) / 10;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="add-holding-modal fire-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fire-info-title"
      >
        <div className="modal-heading">
          <h2 id="fire-info-title">What is FIRE?</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fire-info-body">
          <p>
            <strong>FIRE</strong> means <strong>Financial Independence, Retire Early</strong>.
            You are financially independent when your investments can pay for your yearly
            spending without running out, so working becomes optional.
          </p>

          <h3>How your numbers are calculated</h3>
          <dl>
            <div>
              <dt>Monthly income and expenses</dt>
              <dd>
                Every repeating entry counted per month, whatever its cycle: a payment every 6
                months adds 1/6 each month. One-time and finished entries are left out. Other
                currencies are converted at the latest exchange rate. Yours:{" "}
                {m(plan.monthlyIncome)} in, {m(plan.monthlyExpenses)} out.
              </dd>
            </div>
            <div>
              <dt>Current assets</dt>
              <dd>
                Your portfolio (stocks and cash) plus savings accounts, CDs, and bond face
                values: {m(portfolioValue)} + {m(plan.yieldBalances)} ={" "}
                {m(plan.currentAssets)}. Rental property is not included, because its rent
                already counts as income.
              </dd>
            </div>
            <div>
              <dt>FIRE number</dt>
              <dd>
                Yearly spending in retirement ÷ safe withdrawal rate. Historically about 4% a
                year (3.5% for very long retirements) has lasted; at {rate}% you need{" "}
                {multiple}× your yearly spending: {m(plan.annualSpend)} ÷ {rate}% ={" "}
                <strong>{m(plan.fireNumber)}</strong>.
              </dd>
            </div>
            <div>
              <dt>Time to FIRE</dt>
              <dd>
                Built month by month from {m(plan.currentAssets)} today, with each asset
                growing at its own rate: stocks and cash at your {settings.expected_return_pct}%
                expected return, each bond at its coupon rate, and each savings account or CD
                at its APY. A bond or CD moves into stocks when it matures. Each month also
                adds new money, your income minus expenses (about {m(plan.monthlyInvest)}/mo
                over the next year), into stocks; entries that end, like a finished payment
                plan, stop on their end date. {settings.inflation_pct ?? 0}% inflation is taken
                out so everything is in today&apos;s dollars. The date is the first month your
                assets reach the FIRE number: <strong>{yearsLabel(plan.hitMonth)}</strong>.
              </dd>
            </div>
            <div>
              <dt>Savings rate</dt>
              <dd>
                (Income − expenses) ÷ income: the share of each paycheck you keep. A higher rate
                both grows your assets faster and lowers the spending you need to replace.
              </dd>
            </div>
            <div>
              <dt>Emergency fund</dt>
              <dd>
                Money you can reach quickly (portfolio cash, savings accounts, CDs) compared with
                5–6 months of expenses. Bonds are not counted.
              </dd>
            </div>
          </dl>

          <h3>Keep in mind</h3>
          <p className="muted">
            These are estimates, not advice. Returns and inflation are not guaranteed, taxes are
            not modeled, and bond and report dates you have not entered are placeholders. Change
            the assumptions under Path to FIRE to see how the date moves.
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * A number field that shows a value calculated from the user's entries ("Auto") and
 * keeps following it until the user types their own; clearing it returns to Auto.
 */
function AutoNumberField({
  label,
  value,
  autoValue,
  autoNote,
  resetLabel,
  onChange,
}: {
  label: string;
  value: number | null;
  autoValue: number;
  autoNote: string;
  resetLabel: string;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(Math.round(value ?? autoValue));
  const isAuto = value == null;

  // Push each valid keystroke so the chart updates while typing.
  function update(raw: string) {
    if (raw.trim() === "") {
      onChange(null);
      return;
    }
    const next = Number(raw);
    if (Number.isFinite(next) && next >= 0) onChange(next);
  }

  function commit(raw: string) {
    setText(null);
    if (raw.trim() === "") {
      onChange(null);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    if (isAuto && Math.round(next) === Math.round(autoValue)) return;
    onChange(next);
  }

  return (
    <div className="fire-auto-field">
      <label>
        {label}
        <input
          type="number"
          min="0"
          value={shown}
          onFocus={() => setText(shown)}
          onChange={(event) => {
            const cleaned = cleanNumberInput(event.target);
            setText(cleaned);
            update(cleaned);
          }}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(event.currentTarget.value);
          }}
        />
      </label>
      {isAuto ? (
        <small className="fire-auto-note">
          <span className="fire-auto-badge">Auto</span> {autoNote}
        </small>
      ) : (
        <small className="fire-auto-note">
          Your own value ·{" "}
          <button type="button" onClick={() => onChange(null)}>
            {resetLabel}
          </button>
        </small>
      )}
    </div>
  );
}

const SLICE_COLORS: Record<string, string> = {
  stocks: "var(--navy)",
  bonds: "var(--gold-dark)",
  savings: "#2f8a5b",
  cash: "#8fa3bf",
  real_estate: "#a0522d",
  vehicles_equipment: "#7c6aa6",
  other_assets: "#b08968",
};

const HELD_KEYS = new Set(["real_estate", "vehicles_equipment", "other_assets"]);

/** "11%", "10.5%", "4.25%" */
function formatRate(pct: number) {
  return `${Number(pct.toFixed(2))}%`;
}

function AssetDonut({
  slices,
  growth,
  currency,
}: {
  slices: AssetSlice[];
  /** How each kind of asset grows in the projection, shown under its name. */
  growth: Record<string, string>;
  currency: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <figure className="fire-donut" aria-labelledby="fire-donut-title">
      <figcaption id="fire-donut-title">What you own today</figcaption>
      {slices.some((slice) => HELD_KEYS.has(slice.key)) && (
        <p className="muted fire-donut-note">
          Real estate and other rental assets are shown here but not counted in FIRE assets,
          because their rent is already counted as income.
        </p>
      )}
      {total <= 0 ? (
        <p className="muted">Add holdings, savings accounts, or bonds to see your mix.</p>
      ) : (
        <>
          <DonutRing
            slices={slices.map((slice) => ({ ...slice, color: SLICE_COLORS[slice.key] }))}
            label={`Assets ${money(total, currency)}: ${slices.map((slice) => `${slice.label} ${(slice.share * 100).toFixed(1)}%`).join(", ")}`}
            total={money(total, currency).replace(/\.\d{2}$/, "")}
          />
          <ul className="fire-donut-legend">
            {slices.map((slice) => (
              <li key={slice.key}>
                <span className="fire-donut-swatch" style={{ background: SLICE_COLORS[slice.key] }} />
                <span className="fire-donut-name">
                  {slice.label}
                  {growth[slice.key] && <small>{growth[slice.key]}</small>}
                </span>
                <strong>{money(slice.value, currency).replace(/\.\d{2}$/, "")}</strong>
                <span className="fire-donut-share">{(slice.share * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}

function EntryDialog({
  draft,
  assets,
  saving,
  error,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  assets: FireAsset[];
  saving: boolean;
  error: string | null;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const categories = draft.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const category = categoryFor(draft.kind, draft.category);
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const principal = draftPrincipal(draft);
  const computed =
    category.yields && principal != null && draft.yield_pct !== ""
      ? yieldPayment(principal, Number(draft.yield_pct), draft.frequency)
      : null;
  const title = `${draft.id ? "Edit" : "Add"} ${draft.kind}`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="add-holding-modal fire-dialog" role="dialog" aria-modal="true" aria-labelledby="fire-dialog-title">
        <div className="modal-heading">
          <h2 id="fire-dialog-title">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="modal-fields"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label>
            Type
            <select
              value={draft.category}
              onChange={(event) => {
                const next = categoryFor(draft.kind, event.target.value);
                set({
                  category: event.target.value,
                  frequency:
                    next.key === "bond" ? "semiannual" : next.yields ? "monthly" : draft.frequency,
                });
              }}
            >
              {categories.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <select value={draft.currency} onChange={(event) => set({ currency: event.target.value })}>
              {[...new Set([draft.currency, ...CURRENCIES])].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              autoFocus
              required
              value={draft.name}
              placeholder={
                category.key === "bond"
                  ? "US Treasury 2030"
                  : category.rental
                    ? "Downtown condo"
                  : category.yields
                    ? "High-yield savings"
                    : draft.kind === "income"
                      ? "Paycheck"
                      : "Apartment rent"
              }
              onChange={(event) => set({ name: event.target.value })}
            />
          </label>
          {category.yields === "face" && (
            <div className="fire-dialog-row">
              <label>
                Quantity
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={draft.quantity}
                  onChange={(event) => set({ quantity: cleanNumberInput(event.target) })}
                />
              </label>
              <label>
                Price per bond ({draft.currency})
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={draft.unit_price}
                  onChange={(event) => set({ unit_price: cleanNumberInput(event.target) })}
                />
              </label>
            </div>
          )}
          {category.yields === "face" && draft.id && draft.quantity === "" && draft.principal !== "" && (
            <p className="muted">
              Saved face value: {money(Number(draft.principal), draft.currency)}. Enter the
              quantity and price per bond to update it.
            </p>
          )}
          {category.yields ? (
            <div className="fire-dialog-row">
              {category.yields === "balance" && (
                <label>
                  Balance
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={draft.principal}
                    onChange={(event) => set({ principal: cleanNumberInput(event.target) })}
                  />
                </label>
              )}
              <label>
                {category.yields === "face" ? "Coupon (%)" : "Yield / APY (%)"}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={draft.yield_pct}
                  onChange={(event) => set({ yield_pct: cleanNumberInput(event.target) })}
                />
              </label>
            </div>
          ) : (
            <label>
              Amount ({draft.currency})
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={draft.amount}
                onChange={(event) => set({ amount: cleanNumberInput(event.target) })}
              />
            </label>
          )}
          {category.rental && (
            <fieldset className="fire-rental-asset">
              <legend>Rental asset</legend>
              <label>
                Asset
                <select value={draft.asset_id} onChange={(event) => set({ asset_id: event.target.value })}>
                  <option value="new">+ New asset from this rental</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} · {assetTypeFor(asset.asset_type).label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.asset_id === "new" ? (
                <>
                  <label>
                    Rental type
                    <select
                      value={draft.asset_type}
                      onChange={(event) => set({ asset_type: event.target.value as FireAssetType })}
                    >
                      {ASSET_TYPES.map((type) => (
                        <option key={type.key} value={type.key}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Market value ({draft.currency}, optional)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.market_value}
                      onChange={(event) => set({ market_value: cleanNumberInput(event.target) })}
                    />
                  </label>
                  <p className="muted">Saved to Assets under this income&apos;s name.</p>
                </>
              ) : (
                (() => {
                  const asset = assets.find((item) => item.id === draft.asset_id);
                  return asset ? (
                    <p className="muted">
                      {assetTypeFor(asset.asset_type).label} · market value{" "}
                      {asset.market_value == null ? "not set" : money(Number(asset.market_value), asset.currency)}.
                      Edit it in Assets.
                    </p>
                  ) : null;
                })()
              )}
            </fieldset>
          )}
          <div className="fire-dialog-row">
            <label>
              {category.yields ? "Paid" : "How often"}
              <select
                value={draft.frequency}
                onChange={(event) => set({ frequency: event.target.value as FireFrequency })}
              >
                {FREQUENCIES.filter((item) => !(category.yields && item.key === "once")).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {draft.frequency === "once"
                ? draft.kind === "income"
                  ? "Date received"
                  : "Due date"
                : "First date"}
              <input
                type="date"
                required
                value={draft.starts_on}
                onChange={(event) => set({ starts_on: event.target.value })}
              />
            </label>
          </div>
          {draft.frequency !== "once" && (
            <label>
              {category.key === "bond"
                ? "Matures on"
                : category.key === "cd"
                  ? "CD ends on"
                  : "Ends on (optional)"}
              <input
                type="date"
                required={category.key === "bond"}
                value={draft.ends_on}
                onChange={(event) => set({ ends_on: event.target.value })}
              />
            </label>
          )}
          {computed != null && (
            <p className="notice" role="status">
              {category.yields === "face" && principal != null
                ? `Face value ${money(principal, draft.currency)}. `
                : ""}
              Pays {money(computed, draft.currency)} each time ({frequencyLabel(draft.frequency).toLowerCase()}).
            </p>
          )}
          <label>
            Note (optional)
            <input value={draft.note} maxLength={500} onChange={(event) => set({ note: event.target.value })} />
          </label>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? "Saving…" : draft.id ? "Save changes" : title}
          </button>
        </form>
      </section>
    </div>
  );
}
