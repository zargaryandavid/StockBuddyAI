"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, GraduationCap, PlugZap, RotateCcw, ShieldCheck } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { AdminConnections } from "@/components/admin/admin-connections";
import { AdminEducation } from "@/components/education/admin-education";
import {
  IndustryIcon,
  suggestIndustryIcon,
} from "@/components/industry-icon";
import { PersonaIcon } from "@/components/persona-icon";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export type PersonaDraft = {
  persona: string;
  display_name: string;
  strategy: string;
  prompt: string;
  default_prompt: string;
};

export type IndustryDraft = {
  name: string;
  icon: string;
};

export type StudioConfig = {
  max_position_pct: number;
  max_industry_pct: number;
  deep_value_weight: number;
  trajectory_weight: number;
  llm_model: string;
  use_transaction_history_analytics: boolean;
  daily_wish_checks?: number;
  daily_screenshot_imports?: number;
  daily_ai_reviews?: number;
  industries: IndustryDraft[];
  personas: PersonaDraft[];
  /** Models the persona review can use, and whose API key each needs. */
  models?: ReviewModel[];
};

export type ReviewModel = { id: string; name: string; provider: string };

export function AdminPanel({ email, initial }: { email: string; initial: StudioConfig }) {
  const router = useRouter();
  const [maxPosition, setMaxPosition] = useState(percent(initial.max_position_pct));
  const [industryPosition, setIndustryPosition] = useState(
    percent(initial.max_industry_pct),
  );
  const [deepValue, setDeepValue] = useState(percent(initial.deep_value_weight));
  const [model, setModel] = useState(initial.llm_model);
  const models = initial.models ?? [];
  const provider = models.find((item) => item.id === model)?.provider;
  const [useTransactionHistory, setUseTransactionHistory] = useState(
    initial.use_transaction_history_analytics,
  );
  // Uses per person per day of each AI feature; 0 turns the feature off.
  const [limits, setLimits] = useState(() => limitsFrom(initial));
  const [industries, setIndustries] = useState(() =>
    generateIndustryIcons(initial.industries),
  );
  const [personas, setPersonas] = useState(initial.personas);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<"studio" | "education" | "connections">("studio");
  const trajectory = Math.max(0, Math.min(100, 100 - Number(deepValue || 0)));

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function updatePrompt(persona: string, prompt: string) {
    setPersonas((current) =>
      current.map((item) => (item.persona === persona ? { ...item, prompt } : item)),
    );
  }

  function updateIndustryName(index: number, name: string) {
    setIndustries((current) => {
      const usedIcons = new Set(
        current
          .filter((_, itemIndex) => itemIndex !== index)
          .map((industry) => industry.icon),
      );
      return current.map((industry, itemIndex) =>
        itemIndex === index
          ? {
              ...industry,
              name,
              icon: suggestIndustryIcon(name, usedIcons),
            }
          : industry,
      );
    });
  }

  function addIndustry() {
    setIndustries((current) => {
      const usedIcons = new Set(current.map((industry) => industry.icon));
      return [
        ...current,
        { name: "", icon: suggestIndustryIcon("", usedIcons) },
      ];
    });
  }

  function removeIndustry(index: number) {
    setIndustries((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<StudioConfig>("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify({
          max_position_pct: Number(maxPosition) / 100,
          max_industry_pct: Number(industryPosition) / 100,
          deep_value_weight: Number(deepValue) / 100,
          llm_model: model.trim(),
          use_transaction_history_analytics: useTransactionHistory,
          daily_wish_checks: Number(limits.daily_wish_checks),
          daily_screenshot_imports: Number(limits.daily_screenshot_imports),
          daily_ai_reviews: Number(limits.daily_ai_reviews),
          industries: industries.map((industry) => ({
            name: industry.name,
            icon: industry.icon,
          })),
          prompts: personas.map((persona) => ({
            persona: persona.persona,
            prompt: persona.prompt,
          })),
        }),
      });
      setPersonas(saved.personas);
      setIndustries(generateIndustryIcons(saved.industries));
      setModel(saved.llm_model);
      setUseTransactionHistory(saved.use_transaction_history_analytics);
      setLimits(limitsFrom(saved));
      setMaxPosition(percent(saved.max_position_pct));
      setIndustryPosition(percent(saved.max_industry_pct));
      setDeepValue(percent(saved.deep_value_weight));
      setNotice("Studio settings saved. The next review uses them.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save studio settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell simple-shell">
      <AppHeader email={email} onSignOut={signOut}>
        <Link href="/">
          <Briefcase size={16} aria-hidden="true" />
          Portfolio
        </Link>
        <Link className="active" href="/admin" aria-current="page">
          <ShieldCheck size={16} aria-hidden="true" />
          Admin
        </Link>
      </AppHeader>

      <div className="segmented admin-sections" role="group" aria-label="Admin sections">
        <button
          type="button"
          className={section === "studio" ? "active" : ""}
          aria-pressed={section === "studio"}
          onClick={() => setSection("studio")}
        >
          <ShieldCheck size={15} aria-hidden="true" />
          Studio settings
        </button>
        <button
          type="button"
          className={section === "education" ? "active" : ""}
          aria-pressed={section === "education"}
          onClick={() => setSection("education")}
        >
          <GraduationCap size={15} aria-hidden="true" />
          Education
        </button>
        <button
          type="button"
          className={section === "connections" ? "active" : ""}
          aria-pressed={section === "connections"}
          onClick={() => setSection("connections")}
        >
          <PlugZap size={15} aria-hidden="true" />
          Connections
        </button>
      </div>

      {section === "connections" ? (
        <AdminConnections />
      ) : section === "education" ? (
        <AdminEducation />
      ) : (
      <>
      {error && <div className="alert page-message">{error}</div>}
      {notice && <div className="notice page-message">{notice}</div>}

      <form className="simple-page admin-page" onSubmit={save}>
        <div className="page-heading">
          <div>
            <h1>Admin studio</h1>
            <p className="page-subtitle">Persona prompts and the limits that apply to every user.</p>
          </div>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save studio"}
          </button>
        </div>

        <article className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <p className="step">Book settings</p>
              <h2>Limits and model</h2>
            </div>
          </div>
          <div className="stack">
            <div className="settings-row">
              <label>
                Maximum position %
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={maxPosition}
                  onChange={(event) => setMaxPosition(event.target.value)}
                  required
                />
              </label>
              <label>
                Industry position %
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={industryPosition}
                  onChange={(event) => setIndustryPosition(event.target.value)}
                  required
                />
              </label>
              <label>
                Deep value sleeve %
                <input
                  type="number"
                  min="5"
                  max="95"
                  step="1"
                  value={deepValue}
                  onChange={(event) => setDeepValue(event.target.value)}
                  required
                />
              </label>
              <label>
                Trajectory sleeve %
                <input value={trajectory} readOnly tabIndex={-1} />
              </label>
              <label>
                Review model
                {models.length ? (
                  <select value={model} onChange={(event) => setModel(event.target.value)} required>
                    {!models.some((item) => item.id === model) && <option value={model}>{model}</option>}
                    {models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.provider}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={model} onChange={(event) => setModel(event.target.value)} required />
                )}
                <small className="muted">
                  {provider
                    ? `Uses the ${provider} key from Connections. Save to apply.`
                    : "Uses the key for this model's provider from Connections."}
                </small>
              </label>
              <label className="checkbox-setting">
                <input
                  type="checkbox"
                  checked={useTransactionHistory}
                  onChange={(event) => setUseTransactionHistory(event.target.checked)}
                />
                Use transaction history in Analytics
              </label>
            </div>
          </div>
        </article>

        <article className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <p className="step">Costs</p>
              <h2>AI limits per person</h2>
              <p className="muted">Ask Buddy tokens are per month and reset on the 1st; the other features reset every day. 0 turns a feature off.</p>
            </div>
          </div>
          <div className="settings-row">
            {(
              [
                ["daily_wish_checks", "Wish repeat checks per day"],
                ["daily_screenshot_imports", "Screenshot imports per day"],
                ["daily_ai_reviews", "Ask Buddy tokens per month"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={limits[key]}
                  onChange={(event) => setLimits((current) => ({ ...current, [key]: event.target.value }))}
                  required
                />
              </label>
            ))}
          </div>
          <ResetMyTokens />
        </article>

        <article className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <p className="step">Sectors</p>
              <h2>Industry list</h2>
            </div>
            <button className="text-button" type="button" onClick={addIndustry}>
              + Add industry
            </button>
          </div>
          <div className="industry-scroller" aria-label="Industry list">
            {industries.map((industry, index) => (
              <div className="industry-card" key={index}>
                <span className="industry-icon" aria-hidden="true">
                  <IndustryIcon icon={industry.icon} />
                </span>
                <label className="industry-name">
                  <span className="sr-only">Industry name {index + 1}</span>
                  <input
                    aria-label={`Industry name ${index + 1}`}
                    placeholder="Industry name"
                    value={industry.name}
                    onChange={(event) =>
                      updateIndustryName(index, event.target.value)
                    }
                    required
                  />
                </label>
                <button
                  className="industry-remove"
                  type="button"
                  aria-label={`Remove ${industry.name || `industry ${index + 1}`}`}
                  disabled={industries.length === 1}
                  onClick={() => removeIndustry(index)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </article>

        <div className="persona-scroller" aria-label="Persona prompts">
          {personas.map((persona) => (
            <article className="panel persona-card" key={persona.persona}>
              <div className="prompt-heading">
                <div className="persona-heading">
                  <span className="persona-icon">
                    <PersonaIcon persona={persona.persona} />
                  </span>
                  <div>
                    <p className="step">{persona.strategy}</p>
                    <h2>{persona.display_name}</h2>
                  </div>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => updatePrompt(persona.persona, persona.default_prompt)}
                >
                  Restore built-in
                </button>
              </div>
              <label>
                System prompt
                <textarea
                  value={persona.prompt}
                  onChange={(event) => updatePrompt(persona.persona, event.target.value)}
                  required
                />
              </label>
            </article>
          ))}
        </div>
      </form>
      </>
      )}
    </main>
  );
}

function percent(value: number) {
  return String(Math.round(value * 100));
}

function generateIndustryIcons(industries: IndustryDraft[]) {
  const usedIcons = new Set<string>();
  return industries.map((industry) => {
    const icon = suggestIndustryIcon(industry.name, usedIcons);
    usedIcons.add(icon);
    return { ...industry, icon };
  });
}

function limitsFrom(config: StudioConfig) {
  return {
    daily_wish_checks: String(config.daily_wish_checks ?? 100),
    daily_screenshot_imports: String(config.daily_screenshot_imports ?? 20),
    daily_ai_reviews: String(config.daily_ai_reviews ?? 10),
  };
}

/** Testing aid: gives the signed-in admin today's full AI allowance again. */
function ResetMyTokens() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function reset() {
    setState("busy");
    setMessage("");
    try {
      await api<{ reset: number }>("/api/admin/ai-usage/reset", { method: "POST" });
      setState("done");
      setMessage("Done. Your AI tokens are full again.");
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof Error ? cause.message : "Could not reset your tokens");
    }
  }

  return (
    <div className="reset-tokens">
      <div>
        <p className="reset-tokens-title">Testing</p>
        <p className="muted">Clears this month&apos;s Ask Buddy tokens and today&apos;s other AI use, for your own account only.</p>
      </div>
      <button type="button" className="button" disabled={state === "busy"} onClick={() => void reset()}>
        <RotateCcw size={15} aria-hidden="true" />
        {state === "busy" ? "Resetting…" : "Reset my tokens"}
      </button>
      {message && (
        <p className={state === "error" ? "alert" : "notice"} role={state === "error" ? "alert" : "status"}>
          {message}
        </p>
      )}
    </div>
  );
}
