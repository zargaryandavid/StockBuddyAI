"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { FireAsset, FireEntry, FxRates } from "@/lib/fire";
import { useT } from "@/lib/i18n/client";

import { AssetsSection, type AssetDraft } from "./assets-section";

const CURRENCIES = ["USD", "AMD", "EUR", "GBP", "RUB", "CAD", "CHF", "JPY"];

/** The Assets page: rental property, land, vehicles, and equipment, with the rent each earns. */
export function AssetsPage({ today, currency = "USD" }: { today: string; currency?: string }) {
  const t = useT();
  const [assets, setAssets] = useState<FireAsset[]>([]);
  const [entries, setEntries] = useState<FireEntry[]>([]);
  const [rates, setRates] = useState<FxRates>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api<FireAsset[]>("/api/fire/assets"), api<FireEntry[]>("/api/fire/entries")])
      .then(async ([assetRows, entryRows]) => {
        const assetList = Array.isArray(assetRows) ? assetRows : [];
        const entryList = Array.isArray(entryRows) ? entryRows : [];
        const foreign = [
          ...new Set(
            [...assetList, ...entryList].map((item) => item.currency).filter((code) => code && code !== currency),
          ),
        ];
        const found = await Promise.allSettled(
          foreign.map((code) =>
            api<{ rate: number }>(`/api/fx?from=${encodeURIComponent(code)}&to=${encodeURIComponent(currency)}`).then(
              (result) => [code, result.rate] as const,
            ),
          ),
        );
        if (!active) return;
        const next: FxRates = {};
        for (const result of found) if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
        setRates(next);
        setAssets(assetList);
        setEntries(entryList);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your assets");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currency]);

  async function saveAsset(draft: AssetDraft) {
    const body = JSON.stringify({
      asset_type: draft.asset_type,
      name: draft.name.trim(),
      market_value: draft.market_value === "" ? null : Number(draft.market_value),
      currency: draft.currency,
      location: draft.location.trim() || null,
      note: draft.note.trim() || null,
    });
    const saved = await api<FireAsset>(draft.id ? `/api/fire/assets/${draft.id}` : "/api/fire/assets", {
      method: draft.id ? "PUT" : "POST",
      body,
    });
    setAssets((current) =>
      draft.id ? current.map((item) => (item.id === draft.id ? { ...item, ...saved } : item)) : [...current, saved],
    );
  }

  async function removeAsset(asset: FireAsset) {
    setError(null);
    try {
      await api(`/api/fire/assets/${asset.id}`, { method: "DELETE" });
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      // Its incomes stay, just no longer linked.
      setEntries((current) =>
        current.map((entry) => (entry.asset_id === asset.id ? { ...entry, asset_id: null } : entry)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the asset");
    }
  }

  return (
    <section className="assets-page" aria-labelledby="assets-page-title">
      <header className="assets-page-head">
        <h1 id="assets-page-title">{t("Assets")}</h1>
        <p className="muted page-subtitle">
          {t("Property, land, vehicles, and equipment you own. Link each to its rent in FIRE → Add income.")}
        </p>
      </header>
      {error && (
        <div className="alert" role="alert">
          {/* Fallback messages are English keys; server messages pass through unchanged. */}
          {t(error)}
        </div>
      )}
      <AssetsSection
        assets={assets}
        entries={entries}
        loading={loading}
        today={today}
        rates={rates}
        currency={currency}
        period="monthly"
        currencies={CURRENCIES}
        onSave={saveAsset}
        onRemove={removeAsset}
      />
    </section>
  );
}
