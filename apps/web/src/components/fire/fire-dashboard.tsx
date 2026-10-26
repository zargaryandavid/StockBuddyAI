"use client";

import { createElement, Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useT } from "@/lib/i18n/client";
import { translator, type Translate } from "@/lib/i18n/core";
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

/**
 * Fills a translated sentence with React pieces (bold amounts, links) at its `{name}`
 * placeholders, so the whole sentence is translated as one piece.
 */
function fill(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  return template
    .split(/\{(\w+)\}/)
    .map((piece, index) =>
      index % 2 ? <Fragment key={index}>{piece in parts ? parts[piece] : `{${piece}}`}</Fragment> : piece,
    );
}

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
export function draftProblem(draft: Draft, t: Translate = translator("en")): string | null {
  const category = categoryFor(draft.kind, draft.category);
  if (!draft.name.trim()) return t("Give the entry a name.");
  if (category.yields === "face") {
    if (draft.quantity === "" || !(Number(draft.quantity) > 0)) {
      return t("Enter how many bonds you hold.");
    }
    if (draft.unit_price === "" || !(Number(draft.unit_price) > 0)) {
      return t("Enter the price of one bond.");
    }
  }
  if (
    category.rental &&
    draft.asset_id === "new" &&
    draft.market_value !== "" &&
    !(Number(draft.market_value) >= 0)
  ) {
    return t("Enter the market value (zero or more), or leave it blank.");
  }
  if (category.yields) {
    if (category.yields === "balance" && (draft.principal === "" || !(Number(draft.principal) >= 0))) {
      return t("Enter the balance (zero or more).");
    }
    const rate = Number(draft.yield_pct);
    if (draft.yield_pct === "" || !(rate >= 0 && rate <= 100)) {
      return t("Enter a rate between 0% and 100%.");
    }
  } else if (draft.amount === "" || !(Number(draft.amount) >= 0)) {
    return t("Enter an amount of zero or more.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.starts_on)) {
    return draft.frequency === "once" ? t("Pick the date.") : t("Pick the first date.");
  }
  if (draft.frequency !== "once") {
    if (category.key === "bond" && !draft.ends_on) return t("Pick the maturity date.");
    if (draft.ends_on && !/^\d{4}-\d{2}-\d{2}$/.test(draft.ends_on)) {
      return t("The end date is incomplete. Pick it again.");
    }
    if (draft.ends_on && draft.ends_on < draft.starts_on) {
      const dates = { end: draft.ends_on, start: draft.starts_on };
      return category.key === "bond"
        ? t(
            "The maturity date ({end}) is before the first date ({start}). Move the first date earlier or fix the maturity date.",
            dates,
          )
        : t(
            "The end date ({end}) is before the first date ({start}). Move the first date earlier or fix the end date.",
            dates,
          );
    }
  }
  return null;
}

function nextDate(entry: FireEntry, today: string) {
  return occurrences(entry, today, "2100-12-31")[0] ?? null;
}

function frequencyLabel(frequency: FireFrequency, t: Translate) {
  return t(FREQUENCIES.find((item) => item.key === frequency)?.label ?? frequency);
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
  const t = useT();
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
  const notes = useMemo(() => planNotes(plan, cash, t), [plan, cash, t]);
  const events = useMemo(
    () => monthEvents({ entries, reports, ...calendarMonth, rates, baseCurrency: currency, t }),
    [entries, reports, calendarMonth, rates, currency, t],
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
    const problem = draftProblem(draft, t);
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
            <h1 id="fire-title">{t("FIRE plan")}</h1>
            <InfoButton
              label={t("What is FIRE and how is it calculated?")}
              onClick={() => setShowInfo(true)}
            />
          </div>
          <p className="page-subtitle">
            {t(
              "Track what comes in and goes out, and see when your savings can pay for your life. Estimates, not advice.",
            )}
          </p>
        </div>
      </header>

      {error && (
        <p className="alert" role="alert">
          {/* Fallback messages are English keys; server messages pass through unchanged. */}
          {t(error)}
        </p>
      )}

      {!loading && !ratesLoading && plan.missingRates.length > 0 && (
        <p className="alert" role="status">
          {t(
            "No exchange rate is available for {currencies} yet, so those entries are left out of the totals.",
            { currencies: plan.missingRates.join(", ") },
          )}
        </p>
      )}

      <div className="segmented fire-period" role="group" aria-label={t("Show amounts")}>
        {(["monthly", "annual"] as const).map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={period === option}
            className={period === option ? "active" : ""}
            onClick={() => setPeriod(option)}
          >
            {option === "monthly" ? t("Monthly") : t("Annual")}
          </button>
        ))}
      </div>

      <section className="portfolio-summary-grid" aria-label={t("FIRE summary")}>
        <SummaryTile
          label={period === "annual" ? t("Annual income") : t("Monthly income")}
          value={money(forPeriod(plan.monthlyIncome, period), currency)}
          tone="positive"
        />
        <SummaryTile
          label={period === "annual" ? t("Annual expenses") : t("Monthly expenses")}
          value={money(forPeriod(plan.monthlyExpenses, period), currency)}
          tone="negative"
        />
        <SummaryTile
          label={period === "annual" ? t("Left over each year") : t("Left over each month")}
          value={money(forPeriod(plan.monthlyNet, period), currency)}
          tone={plan.monthlyNet >= 0 ? "positive" : "negative"}
        />
        <SummaryTile
          label={t("Savings rate")}
          value={plan.savingsRate == null ? "—" : `${(plan.savingsRate * 100).toFixed(1)}%`}
        />
        <SummaryTile
          label={t("Current assets")}
          value={money(plan.currentAssets, currency)}
          note={t("Portfolio + savings")}
        />
        <SummaryTile
          label={t("FIRE number")}
          value={plan.fireNumber ? money(plan.fireNumber, currency) : "—"}
          note={t("{multiple}× yearly spending", {
            multiple: Math.round(100 / previewSettings.withdrawal_rate_pct),
          })}
        />
        <SummaryTile
          label={t("Time to FIRE")}
          value={plan.fireNumber ? yearsLabel(plan.hitMonth, t) : "—"}
        />
      </section>


      <div className="fire-columns">
        {(["income", "expense"] as const).map((kind) => {
          const rows = entries.filter((entry) => entry.kind === kind);
          return (
            <section className="panel fire-list" key={kind} aria-labelledby={`fire-${kind}-title`}>
              <div className="fire-list-heading">
                <div className="fire-list-title">
                  <h2 id={`fire-${kind}-title`}>{kind === "income" ? t("Incomes") : t("Expenses")}</h2>
                  <span className="fire-list-count">
                    {rows.length === 1
                      ? t("{count} source", { count: rows.length })
                      : t("{count} sources", { count: rows.length })}
                  </span>
                  <strong
                    className={`fire-list-total ${kind}`}
                    title={t(
                      "Every repeating entry converted to a monthly amount, whatever its payment cycle. One-time and finished entries are not included.",
                    )}
                  >
                    {money(
                      forPeriod(kind === "income" ? plan.monthlyIncome : plan.monthlyExpenses, period),
                      currency,
                    )}
                    {periodSuffix(period, t)}
                  </strong>
                  <button
                    type="button"
                    className="fire-pie-button"
                    aria-label={
                      period === "annual"
                        ? kind === "income"
                          ? t("Annual income breakdown")
                          : t("Annual expense breakdown")
                        : kind === "income"
                          ? t("Monthly income breakdown")
                          : t("Monthly expense breakdown")
                    }
                    title={kind === "income" ? t("Income breakdown") : t("Expense breakdown")}
                    onClick={() => setBreakdownFor(kind)}
                  >
                    <PieChart size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="fire-pie-button"
                    aria-label={kind === "income" ? t("Income by week or month") : t("Expenses by week or month")}
                    title={kind === "income" ? t("Income by week or month") : t("Expenses by week or month")}
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
                  {kind === "income" ? t("Add income") : t("Add expense")}
                </button>
              </div>
              {loading ? (
                <p className="muted">{t("Loading…")}</p>
              ) : rows.length === 0 ? (
                <p className="muted">
                  {kind === "income"
                    ? t("Add salary, rental income, savings accounts, bonds, and other income.")
                    : t("Add rent, bills, insurance, and anything you plan to pay, with when it's due.")}
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
                            {t(category.label)} · {frequencyLabel(entry.frequency, t)}
                            {entry.quantity != null && entry.unit_price != null
                              ? ` · ${t("{quantity} × {price} = {value} at {rate}%", {
                                  quantity: Number(entry.quantity).toLocaleString("en-US"),
                                  price: money(Number(entry.unit_price), entry.currency),
                                  value: money(Number(entry.principal ?? 0), entry.currency),
                                  rate: String(entry.yield_pct),
                                })}`
                              : entry.principal != null && entry.yield_pct != null
                              ? ` · ${t("{amount} at {rate}%", {
                                  amount: money(entry.principal, entry.currency),
                                  rate: String(entry.yield_pct),
                                })}`
                              : category.rental && entry.asset_id
                              ? (() => {
                                  const asset = assets.find((item) => item.id === entry.asset_id);
                                  return asset ? ` · ${t(assetTypeFor(asset.asset_type).label)}: ${asset.name}` : "";
                                })()
                              : ""}
                            {next ? ` · ${t("next {date}", { date: next })}` : ` · ${t("finished")}`}
                            {entry.ends_on && entry.category === "bond"
                              ? ` · ${t("matures {date}", { date: entry.ends_on })}`
                              : ""}
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
                                {periodSuffix(period, t)}
                              </span>
                            )
                          )}
                        </div>
                        <div className="fire-entry-actions">
                          <button
                            type="button"
                            aria-label={t("Edit {name}", { name: entry.name })}
                            onClick={() => setDraft(draftFrom(entry))}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("Remove {name}", { name: entry.name })}
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
          <h2 id="fire-projection-title">{t("Path to FIRE")}</h2>
          <InfoButton
            label={t("How is the path to FIRE calculated?")}
            onClick={() => setShowInfo(true)}
          />
        </div>
        <div className="fire-assumptions">
          <label>
            {t("Expected yearly return (%)")}
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
            label={t("Invest each month")}
            value={settingsDraft.monthly_invest}
            autoValue={plan.autoInvest}
            autoNote={t("Income − expenses, excl. interest")}
            resetLabel={t("Use income minus expenses")}
            onChange={(next) =>
              setSettingsDraft((current) => ({ ...current, monthly_invest: next }))
            }
          />
          <AutoNumberField
            label={t("Yearly spending in retirement")}
            value={settingsDraft.retirement_annual_spend}
            autoValue={plan.monthlyExpenses * 12}
            autoNote={t("Current expenses × 12")}
            resetLabel={t("Use current expenses")}
            onChange={(next) =>
              setSettingsDraft((current) => ({ ...current, retirement_annual_spend: next }))
            }
          />
          <div className="fire-auto-field">
            <label>
              {t("Safe withdrawal rate (%)")}
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
                {t("Above 4.5% is risky. 4% is the usual safe rate.")}
              </small>
            ) : (
              <small className="fire-auto-note">{t("4% is the usual safe rate.")}</small>
            )}
          </div>
          <div className="fire-auto-field">
            <label>
              {t("Inflation (%)")}
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
            <small className="fire-auto-note">{t("Results are in today's dollars.")}</small>
          </div>
          <div className="fire-save-assumptions">
            <button
              type="button"
              className="button primary"
              disabled={!settingsDirty}
              onClick={() => void saveSettings()}
            >
              {t("Save assumptions")}
            </button>
            {settingsDirty && (
              <small className="fire-unsaved" role="status">
                {t("Unsaved: the chart already shows these numbers")}
              </small>
            )}
          </div>
        </div>
        <p className="muted fire-assets-note">
          {t(
            "Current assets {assets} = portfolio {portfolio} + savings, CDs and bonds {savings}. Fields marked Auto follow your entries until you change them.",
            {
              assets: money(plan.currentAssets, currency),
              portfolio: money(portfolioValue, currency),
              savings: money(plan.yieldBalances, currency),
            },
          )}
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
              stocks: t("{rate} expected return", { rate: formatRate(previewSettings.expected_return_pct) }),
              cash: t("{rate}, grows with stocks", { rate: formatRate(previewSettings.expected_return_pct) }),
              bonds:
                plan.bondYieldPct == null
                  ? ""
                  : t("{rate} avg coupon", { rate: formatRate(plan.bondYieldPct) }),
              savings:
                plan.savingsYieldPct == null
                  ? ""
                  : t("{rate} avg APY", { rate: formatRate(plan.savingsYieldPct) }),
              real_estate: t("Not in FIRE assets"),
              vehicles_equipment: t("Not in FIRE assets"),
              other_assets: t("Not in FIRE assets"),
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
          <button type="button" aria-label={t("Previous month")} onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 id="fire-calendar-title">
            {t("{month} {year}", { month: t(MONTHS[calendarMonth.month]), year: calendarMonth.year })}
          </h2>
          <button type="button" aria-label={t("Next month")} onClick={() => shiftMonth(1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <div className="fire-calendar-totals">
            <span className="positive">{t("In {amount}", { amount: money(monthIncome, currency) })}</span>
            <span className="negative">{t("Out {amount}", { amount: money(monthExpense, currency) })}</span>
          </div>
        </div>
        <div className="fire-legend" aria-hidden="true">
          <span className="legend-income">{t("Income")}</span>
          <span className="legend-expense">{t("Expense")}</span>
          <span className="legend-report">{t("Report date (est. = estimated)")}</span>
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
              <p className="muted">{t("Nothing scheduled.")}</p>
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
          data={breakdown(entries, breakdownFor, today, rates, currency, t)}
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
  const t = useT();
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
    <div className="fire-month" role="grid" aria-label={t("Month calendar")}>
      {WEEKDAYS.map((day) => (
        <span key={day} className="fire-weekday" role="columnheader">
          {t(day)}
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
            aria-label={
              dayEvents.length === 1
                ? t("{day}: {count} item", { day, count: dayEvents.length })
                : t("{day}: {count} items", { day, count: dayEvents.length })
            }
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
              <span className="fire-more">{t("+{count} more", { count: dayEvents.length - 3 })}</span>
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
  const t = useT();
  const view = currencyView(entry, today, rates, currency, t);
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
        <span>
          {loadingRate
            ? t("Converting…")
            : t("No {currency} exchange rate yet", { currency: view.currency })}
        </span>
      </span>
    );
  }
  return (
    <span className="fire-foreign">
      {heading}
      <span>≈ {t("{amount} total", { amount: money(view.basePerPayment, currency) })}</span>
      {view.baseMonthly != null && view.baseMonthly > 0 && (
        <span>
          ≈{" "}
          {period === "annual"
            ? t("{amount}/year", { amount: money(forPeriod(view.baseMonthly, period), currency) })
            : t("{amount}/month", { amount: money(forPeriod(view.baseMonthly, period), currency) })}
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

  const t = useT();
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
          <h2 id="fire-info-title">{t("What is FIRE?")}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fire-info-body">
          <p>
            {fill(
              t(
                "{fire} means {meaning}. You are financially independent when your investments can pay for your yearly spending without running out, so working becomes optional.",
              ),
              {
                fire: <strong>FIRE</strong>,
                meaning: <strong>{t("Financial Independence, Retire Early")}</strong>,
              },
            )}
          </p>

          <h3>{t("How your numbers are calculated")}</h3>
          <dl>
            <div>
              <dt>{t("Monthly income and expenses")}</dt>
              <dd>
                {t(
                  "Every repeating entry counted per month, whatever its cycle: a payment every 6 months adds 1/6 each month. One-time and finished entries are left out. Other currencies are converted at the latest exchange rate. Yours: {income} in, {expenses} out.",
                  { income: m(plan.monthlyIncome), expenses: m(plan.monthlyExpenses) },
                )}
              </dd>
            </div>
            <div>
              <dt>{t("Current assets")}</dt>
              <dd>
                {t(
                  "Your portfolio (stocks and cash) plus savings accounts, CDs, and bond face values: {portfolio} + {savings} = {total}. Rental property is not included, because its rent already counts as income.",
                  {
                    portfolio: m(portfolioValue),
                    savings: m(plan.yieldBalances),
                    total: m(plan.currentAssets),
                  },
                )}
              </dd>
            </div>
            <div>
              <dt>{t("FIRE number")}</dt>
              <dd>
                {fill(
                  t(
                    "Yearly spending in retirement ÷ safe withdrawal rate. Historically about 4% a year (3.5% for very long retirements) has lasted; at {rate}% you need {multiple}× your yearly spending: {spending} ÷ {rate}% = {target}.",
                  ),
                  {
                    rate,
                    multiple,
                    spending: m(plan.annualSpend),
                    target: <strong>{m(plan.fireNumber)}</strong>,
                  },
                )}
              </dd>
            </div>
            <div>
              <dt>{t("Time to FIRE")}</dt>
              <dd>
                {fill(
                  t(
                    "Built month by month from {assets} today, with each asset growing at its own rate: stocks and cash at your {return}% expected return, each bond at its coupon rate, and each savings account or CD at its APY. A bond or CD moves into stocks when it matures. Each month also adds new money, your income minus expenses (about {invest}/mo over the next year), into stocks; entries that end, like a finished payment plan, stop on their end date. {inflation}% inflation is taken out so everything is in today's dollars. The date is the first month your assets reach the FIRE number: {time}.",
                  ),
                  {
                    assets: m(plan.currentAssets),
                    return: settings.expected_return_pct,
                    invest: m(plan.monthlyInvest),
                    inflation: settings.inflation_pct ?? 0,
                    time: <strong>{yearsLabel(plan.hitMonth, t)}</strong>,
                  },
                )}
              </dd>
            </div>
            <div>
              <dt>{t("Savings rate")}</dt>
              <dd>
                {t(
                  "(Income − expenses) ÷ income: the share of each paycheck you keep. A higher rate both grows your assets faster and lowers the spending you need to replace.",
                )}
              </dd>
            </div>
            <div>
              <dt>{t("Emergency fund")}</dt>
              <dd>
                {t(
                  "Money you can reach quickly (portfolio cash, savings accounts, CDs) compared with 5–6 months of expenses. Bonds are not counted.",
                )}
              </dd>
            </div>
          </dl>

          <h3>{t("Keep in mind")}</h3>
          <p className="muted">
            {t(
              "These are estimates, not advice. Returns and inflation are not guaranteed, taxes are not modeled, and bond and report dates you have not entered are placeholders. Change the assumptions under Path to FIRE to see how the date moves.",
            )}
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
  const t = useT();
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
          <span className="fire-auto-badge">{t("Auto")}</span> {autoNote}
        </small>
      ) : (
        <small className="fire-auto-note">
          {t("Your own value")} ·{" "}
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
  const t = useT();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <figure className="fire-donut" aria-labelledby="fire-donut-title">
      <figcaption id="fire-donut-title">{t("What you own today")}</figcaption>
      {slices.some((slice) => HELD_KEYS.has(slice.key)) && (
        <p className="muted fire-donut-note">
          {t(
            "Real estate and other rental assets are shown here but not counted in FIRE assets, because their rent is already counted as income.",
          )}
        </p>
      )}
      {total <= 0 ? (
        <p className="muted">{t("Add holdings, savings accounts, or bonds to see your mix.")}</p>
      ) : (
        <>
          <DonutRing
            slices={slices.map((slice) => ({ ...slice, label: t(slice.label), color: SLICE_COLORS[slice.key] }))}
            label={t("Assets {total}: {slices}", {
              total: money(total, currency),
              slices: slices.map((slice) => `${t(slice.label)} ${(slice.share * 100).toFixed(1)}%`).join(", "),
            })}
            total={money(total, currency).replace(/\.\d{2}$/, "")}
          />
          <ul className="fire-donut-legend">
            {slices.map((slice) => (
              <li key={slice.key}>
                <span className="fire-donut-swatch" style={{ background: SLICE_COLORS[slice.key] }} />
                <span className="fire-donut-name">
                  {t(slice.label)}
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
  const t = useT();
  const categories = draft.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const category = categoryFor(draft.kind, draft.category);
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const principal = draftPrincipal(draft);
  const computed =
    category.yields && principal != null && draft.yield_pct !== ""
      ? yieldPayment(principal, Number(draft.yield_pct), draft.frequency)
      : null;
  const title = draft.id
    ? draft.kind === "income"
      ? t("Edit income")
      : t("Edit expense")
    : draft.kind === "income"
      ? t("Add income")
      : t("Add expense");

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
          <button type="button" aria-label={t("Close")} onClick={onClose}>
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
            {t("Type")}
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
                  {t(item.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Currency")}
            <select value={draft.currency} onChange={(event) => set({ currency: event.target.value })}>
              {[...new Set([draft.currency, ...CURRENCIES])].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Name")}
            <input
              autoFocus
              required
              value={draft.name}
              placeholder={
                category.key === "bond"
                  ? t("US Treasury 2030")
                  : category.rental
                    ? t("Downtown condo")
                  : category.yields
                    ? t("High-yield savings")
                    : draft.kind === "income"
                      ? t("Paycheck")
                      : t("Apartment rent")
              }
              onChange={(event) => set({ name: event.target.value })}
            />
          </label>
          {category.yields === "face" && (
            <div className="fire-dialog-row">
              <label>
                {t("Quantity")}
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
                {t("Price per bond ({currency})", { currency: draft.currency })}
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
              {t("Saved face value: {amount}. Enter the quantity and price per bond to update it.", {
                amount: money(Number(draft.principal), draft.currency),
              })}
            </p>
          )}
          {category.yields ? (
            <div className="fire-dialog-row">
              {category.yields === "balance" && (
                <label>
                  {t("Balance")}
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
                {category.yields === "face" ? t("Coupon (%)") : t("Yield / APY (%)")}
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
              {t("Amount ({currency})", { currency: draft.currency })}
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
              <legend>{t("Rental asset")}</legend>
              <label>
                {t("Asset")}
                <select value={draft.asset_id} onChange={(event) => set({ asset_id: event.target.value })}>
                  <option value="new">{t("+ New asset from this rental")}</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} · {t(assetTypeFor(asset.asset_type).label)}
                    </option>
                  ))}
                </select>
              </label>
              {draft.asset_id === "new" ? (
                <>
                  <label>
                    {t("Rental type")}
                    <select
                      value={draft.asset_type}
                      onChange={(event) => set({ asset_type: event.target.value as FireAssetType })}
                    >
                      {ASSET_TYPES.map((type) => (
                        <option key={type.key} value={type.key}>
                          {t(type.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Market value ({currency}, optional)", { currency: draft.currency })}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.market_value}
                      onChange={(event) => set({ market_value: cleanNumberInput(event.target) })}
                    />
                  </label>
                  <p className="muted">{t("Saved to Assets under this income's name.")}</p>
                </>
              ) : (
                (() => {
                  const asset = assets.find((item) => item.id === draft.asset_id);
                  return asset ? (
                    <p className="muted">
                      {t(assetTypeFor(asset.asset_type).label)} ·{" "}
                      {t("market value {value}. Edit it in Assets.", {
                        value:
                          asset.market_value == null
                            ? t("not set")
                            : money(Number(asset.market_value), asset.currency),
                      })}
                    </p>
                  ) : null;
                })()
              )}
            </fieldset>
          )}
          <div className="fire-dialog-row">
            <label>
              {category.yields ? t("Paid") : t("How often")}
              <select
                value={draft.frequency}
                onChange={(event) => set({ frequency: event.target.value as FireFrequency })}
              >
                {FREQUENCIES.filter((item) => !(category.yields && item.key === "once")).map((item) => (
                  <option key={item.key} value={item.key}>
                    {t(item.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {draft.frequency === "once"
                ? draft.kind === "income"
                  ? t("Date received")
                  : t("Due date")
                : t("First date")}
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
                ? t("Matures on")
                : category.key === "cd"
                  ? t("CD ends on")
                  : t("Ends on (optional)")}
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
                ? t("Face value {value}. Pays {amount} each time ({frequency}).", {
                    value: money(principal, draft.currency),
                    amount: money(computed, draft.currency),
                    frequency: frequencyLabel(draft.frequency, t).toLowerCase(),
                  })
                : t("Pays {amount} each time ({frequency}).", {
                    amount: money(computed, draft.currency),
                    frequency: frequencyLabel(draft.frequency, t).toLowerCase(),
                  })}
            </p>
          )}
          <label>
            {t("Note (optional)")}
            <input value={draft.note} maxLength={500} onChange={(event) => set({ note: event.target.value })} />
          </label>
          {error && (
            <p className="alert" role="alert">
              {t(error)}
            </p>
          )}
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? t("Saving…") : draft.id ? t("Save changes") : title}
          </button>
        </form>
      </section>
    </div>
  );
}
