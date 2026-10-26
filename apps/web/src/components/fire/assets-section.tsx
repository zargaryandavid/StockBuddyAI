"use client";

import { createElement, useEffect, useState } from "react";
import {
  Building2,
  Car,
  Ellipsis,
  Home,
  Map,
  MapPin,
  Pencil,
  Plane,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  ASSET_TYPES,
  assetTypeFor,
  monthlyAmount,
  toBase,
  type FireAsset,
  type FireAssetType,
  type FireEntry,
  type FxRates,
} from "@/lib/fire";
import { forPeriod, periodSuffix, type Period } from "@/lib/fire-views";
import { cleanNumberInput } from "@/lib/inputs";
import { money } from "@/lib/portfolio-metrics";

const ASSET_ICONS: Record<string, LucideIcon> = {
  home: Home,
  plane: Plane,
  "building-2": Building2,
  map: Map,
  car: Car,
  wrench: Wrench,
  ellipsis: Ellipsis,
};

export function AssetIcon({ type, size = 16 }: { type: string; size?: number }) {
  return createElement(ASSET_ICONS[assetTypeFor(type).icon] ?? Ellipsis, { size, "aria-hidden": true });
}

export type AssetDraft = {
  id: string | null;
  asset_type: FireAssetType;
  name: string;
  market_value: string;
  currency: string;
  location: string;
  note: string;
};

export function newAssetDraft(currency: string): AssetDraft {
  return { id: null, asset_type: "residential", name: "", market_value: "", currency, location: "", note: "" };
}

function assetDraftFrom(asset: FireAsset): AssetDraft {
  return {
    id: asset.id,
    asset_type: asset.asset_type,
    name: asset.name,
    market_value: asset.market_value == null ? "" : String(Number(asset.market_value)),
    currency: asset.currency || "USD",
    location: asset.location ?? "",
    note: asset.note ?? "",
  };
}

/** Rental property, land, vehicles, and equipment, with the income each one earns. */
export function AssetsSection({
  assets,
  entries,
  loading,
  today,
  rates,
  currency,
  period,
  currencies,
  onSave,
  onRemove,
}: {
  assets: FireAsset[];
  entries: FireEntry[];
  loading: boolean;
  today: string;
  rates: FxRates;
  currency: string;
  period: Period;
  currencies: string[];
  onSave: (draft: AssetDraft) => Promise<void>;
  onRemove: (asset: FireAsset) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AssetDraft | null>(null);
  const total = assets.reduce(
    (sum, asset) => sum + (toBase(Number(asset.market_value ?? 0), asset.currency, rates, currency) ?? 0),
    0,
  );

  return (
    <section className="panel fire-list fire-assets" aria-labelledby="fire-assets-title">
      <div className="fire-list-heading">
        <div className="fire-list-title">
          <h2 id="fire-assets-title">Your assets</h2>
          <span className="fire-list-count">
            {assets.length} {assets.length === 1 ? "asset" : "assets"}
          </span>
          {total > 0 && <strong className="fire-list-total asset">{money(total, currency)}</strong>}
        </div>
        <button type="button" className="button primary fire-add" onClick={() => setDraft(newAssetDraft(currency))}>
          Add asset
        </button>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="muted">
          Add rental property, land, or a vehicle or equipment you rent out. Adding rental
          income creates its asset here, and you can link an asset to a rental income from
          the income form.
        </p>
      ) : (
        <ul>
          {assets.map((asset) => {
            const type = assetTypeFor(asset.asset_type);
            const linked = entries.filter((entry) => entry.asset_id === asset.id);
            const earns = linked.reduce(
              (sum, entry) => sum + monthlyAmount(entry, today, rates, currency),
              0,
            );
            return (
              <li key={asset.id} className="fire-entry asset">
                <span className="fire-entry-icon">
                  <AssetIcon type={asset.asset_type} />
                </span>
                <div className="fire-entry-main">
                  <strong>{asset.name}</strong>
                  <span>
                    {type.label} ·{" "}
                    {asset.location && (
                      <>
                        <a
                          className="fire-asset-location"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(asset.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Google Maps"
                        >
                          <MapPin size={12} aria-hidden="true" />
                          {asset.location}
                        </a>{" "}
                        ·{" "}
                      </>
                    )}
                    {linked.length
                      ? `earns ${money(forPeriod(earns, period), currency)}${periodSuffix(period)} from ${linked.map((entry) => entry.name).join(", ")}`
                      : "not linked to an income yet"}
                  </span>
                </div>
                <div className="fire-entry-amount">
                  <strong>
                    {asset.market_value == null ? "No value" : money(Number(asset.market_value), asset.currency)}
                  </strong>
                  {asset.market_value != null && asset.currency !== currency && (
                    <span>
                      {(() => {
                        const converted = toBase(Number(asset.market_value), asset.currency, rates, currency);
                        return converted == null ? "no exchange rate" : `≈ ${money(converted, currency)}`;
                      })()}
                    </span>
                  )}
                </div>
                <div className="fire-entry-actions">
                  <button type="button" aria-label={`Edit asset ${asset.name}`} onClick={() => setDraft(assetDraftFrom(asset))}>
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Remove asset ${asset.name}`} onClick={() => void onRemove(asset)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {draft && (
        <AssetDialog
          draft={draft}
          currencies={currencies}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={async () => {
            await onSave(draft);
            setDraft(null);
          }}
        />
      )}
    </section>
  );
}

export function assetDraftProblem(draft: AssetDraft): string | null {
  if (!draft.name.trim()) return "Give the asset a name.";
  if (draft.market_value !== "" && !(Number(draft.market_value) >= 0)) {
    return "Enter the market value (zero or more), or leave it blank.";
  }
  return null;
}

function AssetDialog({
  draft,
  currencies,
  onChange,
  onClose,
  onSave,
}: {
  draft: AssetDraft;
  currencies: string[];
  onChange: (draft: AssetDraft) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<AssetDraft>) => {
    onChange({ ...draft, ...patch });
    setError(null);
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const problem = assetDraftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the asset");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="add-holding-modal fire-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
        <div className="modal-heading">
          <h2 id="asset-dialog-title">{draft.id ? "Edit asset" : "Add asset"}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="modal-fields"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            Rental type
            <select value={draft.asset_type} onChange={(event) => set({ asset_type: event.target.value as FireAssetType })}>
              {ASSET_TYPES.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input autoFocus value={draft.name} placeholder="Downtown condo" onChange={(event) => set({ name: event.target.value })} />
          </label>
          <div className="fire-dialog-row">
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
            <label>
              Currency
              <select value={draft.currency} onChange={(event) => set({ currency: event.target.value })}>
                {[...new Set([draft.currency, ...currencies])].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Location (optional)
            <input
              value={draft.location}
              maxLength={200}
              placeholder="Street, city, or area"
              onChange={(event) => set({ location: event.target.value })}
            />
          </label>
          <label>
            Note (optional)
            <input value={draft.note} maxLength={500} onChange={(event) => set({ note: event.target.value })} />
          </label>
          <p className="muted">
            Link it to its rent from the income form (Type: Rental income). Assets are shown
            in &ldquo;What you own today&rdquo; but are not FIRE assets, because their income
            is already counted.
          </p>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? "Saving…" : draft.id ? "Save asset" : "Add asset"}
          </button>
        </form>
      </section>
    </div>
  );
}
