"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, Loader2, ShieldCheck, Sparkles } from "lucide-react";

import { api, type Portfolio } from "@/lib/api";
import { ageOn } from "@/lib/age";
import { buildAiPrompt, type PromptData, type PromptGoal, type PromptOptions } from "@/lib/ai-prompt";
import { copyText } from "@/lib/copy";
import type { FireAsset, FireEntry, FireSettings, FxRates } from "@/lib/fire";
import { useI18n } from "@/lib/i18n/client";
import type { NetWorthPoint, Quote } from "@/lib/today";
import type { BookSettings } from "@/lib/workspace";

const FIRE_DEFAULTS: FireSettings = {
  expected_return_pct: 7,
  retirement_annual_spend: null,
  monthly_invest: null,
  withdrawal_rate_pct: 4,
  inflation_pct: 3,
};

type ResolveResult = { query: string; data?: Quote };

const GOAL_LABELS: { key: PromptGoal; label: string }[] = [
  { key: "review", label: "A full review of my finances" },
  { key: "fire", label: "Reach financial freedom (FIRE) sooner" },
  { key: "risk", label: "Check my risk and diversification" },
  { key: "retirement", label: "Retirement accounts and taxes (Roth IRA, 401(k), 529)" },
  { key: "custom", label: "My own question" },
];

/** Everything the prompt describes, loaded when the dialog opens. */
async function loadData(portfolios: Portfolio[], book: BookSettings, today: string): Promise<PromptData> {
  const currency = portfolios[0]?.base_currency ?? "USD";
  const byCurrency = new Map<string, Set<string>>();
  for (const portfolio of portfolios) {
    const code = portfolio.base_currency ?? "USD";
    const set = byCurrency.get(code) ?? new Set<string>();
    for (const position of portfolio.portfolio_positions) if (position.ticker.trim()) set.add(position.ticker.trim().toUpperCase());
    byCurrency.set(code, set);
  }
  const [entries, assets, settings, history, wishes, profile, ...answers] = await Promise.all([
    api<FireEntry[]>("/api/fire/entries").catch(() => []),
    api<FireAsset[]>("/api/fire/assets").catch(() => []),
    api<FireSettings>("/api/fire/settings").catch(() => null),
    api<NetWorthPoint[]>("/api/net-worth").catch(() => []),
    api<{ list: string; text: string; done: boolean }[]>("/api/wishes").catch(() => []),
    api<{ date_of_birth: string | null }>("/api/profile").catch(() => null),
    ...[...byCurrency.entries()]
      .filter(([, set]) => set.size)
      .map(([code, set]) =>
        api<ResolveResult[]>("/api/securities/resolve-batch", {
          method: "POST",
          body: JSON.stringify({ queries: [...set].sort(), base_currency: code }),
        }).catch(() => [] as ResolveResult[]),
      ),
  ]);
  const quotes = new Map<string, Quote>();
  for (const item of (answers as ResolveResult[][]).flat()) if (item.data) quotes.set(item.query.toUpperCase(), item.data);

  const list = <T,>(value: unknown) => (Array.isArray(value) ? (value as T[]) : []);
  const fireEntries = list<FireEntry>(entries);
  const fireAssets = list<FireAsset>(assets);
  const foreign = [
    ...new Set(
      [
        ...fireEntries.map((item) => item.currency),
        ...fireAssets.map((item) => item.currency),
        ...portfolios.flatMap((portfolio) => [portfolio.base_currency ?? "USD", ...(portfolio.other_cash ?? []).map((item) => item.currency)]),
      ].filter((code) => code && code !== currency),
    ),
  ];
  const rates: FxRates = {};
  await Promise.all(
    foreign.map((code) =>
      api<{ rate: number }>(`/api/fx?from=${encodeURIComponent(code)}&to=${encodeURIComponent(currency)}`)
        .then((result) => {
          if (result?.rate) rates[code] = result.rate;
        })
        .catch(() => undefined),
    ),
  );
  return {
    today,
    currency,
    age: ageOn(profile?.date_of_birth ?? null, today),
    portfolios,
    quotes,
    rates,
    entries: fireEntries,
    assets: fireAssets,
    settings: { ...FIRE_DEFAULTS, ...(settings ?? {}) },
    limits: { max_position_pct: book.max_position_pct, max_industry_pct: book.max_industry_pct, min_cash_pct: book.min_cash_pct },
    history: list<NetWorthPoint>(history),
    wishes: list<{ list: string; text: string; done: boolean }>(wishes),
  };
}

/**
 * Builds a prompt that describes the person's whole financial picture for another AI tool,
 * to copy and paste. Nothing is sent to any AI from here.
 */
export function AiPromptDialog({
  portfolios,
  loadingPortfolios = false,
  book,
  today,
  onClose,
}: {
  portfolios: Portfolio[];
  /** Still fetching the portfolios: wait, so the prompt never leaves them out. */
  loadingPortfolios?: boolean;
  book: BookSettings;
  today: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [loaded, setLoaded] = useState<{ key: string; data: PromptData } | null>(null);
  const [failed, setFailed] = useState(false);
  const [options, setOptions] = useState<PromptOptions>({
    goal: "review",
    question: "",
    amounts: "exact",
    names: true,
    answerIn: locale === "hy" ? "hy" : "en",
  });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  // Holdings and cash as they are now, so the prompt follows the portfolios once they load
  // (or change), not only what was on screen when the window opened.
  const portfolioKey = JSON.stringify(
    portfolios.map((portfolio) => [
      portfolio.id,
      portfolio.cash,
      portfolio.base_currency,
      portfolio.other_cash,
      portfolio.portfolio_positions.map((position) => [position.ticker, position.shares, position.purchase_price]),
    ]),
  );
  useEffect(() => {
    if (loadingPortfolios) return;
    let active = true;
    const key = portfolioKey;
    loadData(portfolios, book, today)
      .then((result) => {
        if (active) setLoaded({ key, data: result });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
    // portfolioKey stands for the portfolios' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioKey, loadingPortfolios, book, today]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Only the data read for the portfolios as they are now; older data waits for the new read.
  const data = !loadingPortfolios && loaded?.key === portfolioKey ? loaded.data : null;
  const prompt = useMemo(() => (data ? buildAiPrompt(data, options) : ""), [data, options]);
  const set = (patch: Partial<PromptOptions>) => setOptions((current) => ({ ...current, ...patch }));

  async function copy() {
    if (await copyText(prompt)) {
      setCopied(true);
      setCopyError(false);
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      setCopyError(true);
    }
  }

  function download() {
    const file = new Blob([prompt], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `myportfoliobuddy-ai-prompt-${today}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="add-holding-modal ai-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-prompt-title">
        <div className="modal-heading">
          <h2 id="ai-prompt-title">
            <Sparkles size={18} aria-hidden="true" /> {t("AI prompt of your finances")}
          </h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">
          {t(
            "A ready-made prompt with your portfolios, savings, bonds, property, income, expenses, FIRE plan and goals. Paste it into ChatGPT, Claude, Gemini or any AI to get an analysis that knows your whole picture.",
          )}
        </p>

        <div className="ai-prompt-options">
          <label>
            {t("What should the AI help with?")}
            <select value={options.goal} onChange={(event) => set({ goal: event.target.value as PromptGoal })}>
              {GOAL_LABELS.map((goal) => (
                <option key={goal.key} value={goal.key}>
                  {t(goal.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {options.goal === "custom" ? t("Your question") : t("Anything to add? (optional)")}
            <textarea
              rows={2}
              maxLength={600}
              value={options.question}
              placeholder={t("e.g. Should I pay off my car loan or invest more?")}
              onChange={(event) => set({ question: event.target.value })}
            />
          </label>
          <div className="ai-prompt-switches">
            <label className="ai-prompt-check">
              <input type="checkbox" checked={options.amounts === "rounded"} onChange={(event) => set({ amounts: event.target.checked ? "rounded" : "exact" })} />
              {t("Round amounts to the nearest $100")}
            </label>
            <label className="ai-prompt-check">
              <input type="checkbox" checked={!options.names} onChange={(event) => set({ names: !event.target.checked })} />
              {t("Leave out names (use categories only)")}
            </label>
            <label className="ai-prompt-check">
              {t("AI answers in")}
              <select value={options.answerIn} onChange={(event) => set({ answerIn: event.target.value as "en" | "hy" })}>
                <option value="en">English</option>
                <option value="hy">Հայերեն</option>
              </select>
            </label>
          </div>
        </div>

        {failed ? (
          <p className="alert" role="alert">
            {t("Could not load your data. Close this window and try again.")}
          </p>
        ) : !data ? (
          <p className="muted ai-prompt-loading">
            <Loader2 size={16} className="spinning" aria-hidden="true" /> {t("Reading your portfolios, plan and goals…")}
          </p>
        ) : (
          <textarea className="ai-prompt-text" readOnly value={prompt} aria-label={t("The prompt")} onFocus={(event) => event.currentTarget.select()} />
        )}

        <div className="ai-prompt-actions">
          <button type="button" className="button primary" disabled={!data} onClick={() => void copy()}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied ? t("Copied: now paste it into your AI") : t("Copy prompt")}
          </button>
          <button type="button" className="button" disabled={!data} onClick={download}>
            <Download size={16} aria-hidden="true" /> {t("Download .txt")}
          </button>
          <span className="ai-prompt-open">
            {t("Open:")}
            {[
              ["ChatGPT", "https://chatgpt.com/"],
              ["Claude", "https://claude.ai/new"],
              ["Gemini", "https://gemini.google.com/app"],
            ].map(([name, href]) => (
              <a key={name} href={href} target="_blank" rel="noopener noreferrer">
                {name} <ExternalLink size={12} aria-hidden="true" />
              </a>
            ))}
          </span>
        </div>
        {copyError && (
          <p className="alert" role="alert">
            {t("Copy didn't work here. Click in the prompt, select all and copy it by hand.")}
          </p>
        )}
        <p className="muted ai-prompt-privacy">
          <ShieldCheck size={14} aria-hidden="true" />
          {t(
            "Built on your device. Nothing is sent to any AI until you paste it yourself, and your email is never included. Read it before you share it.",
          )}
        </p>
      </section>
    </div>
  );
}
