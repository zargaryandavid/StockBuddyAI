"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, CircleDashed, PlugZap } from "lucide-react";

import { api } from "@/lib/api";
import type { Translate } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";

type FieldKind = "secret" | "text" | "port" | "bool";
type Source = "admin" | "env" | "default" | "unset";

export type ConnectionField = {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder: string;
  help: string;
  source: Source;
  unreadable: boolean;
  hint?: string | null;
  value?: string | number | boolean;
};

export type TestResult = { ok: boolean; message: string; ms: number; tested_at: string };

export type ConnectionInfo = {
  id: string;
  name: string;
  purpose: string;
  configurable: boolean;
  configured: boolean;
  fields: ConnectionField[];
  last_test: TestResult | null;
};

const SOURCE_LABEL: Record<Source, string> = {
  admin: "Saved in Admin",
  env: "From server config",
  default: "Default",
  unset: "Not set",
};

/**
 * Test results and save errors arrive from the API in English. Fixed sentences are looked up
 * as they are; sentences with a value inside are matched here and translated as a whole.
 */
const MESSAGE_PATTERNS: [RegExp, string, string[]][] = [
  [/^Key works\. (.+) is available\.$/, "Key works. {model} is available.", ["model"]],
  [/^The key works, but the model (.+) isn't available\.$/, "The key works, but the model {model} isn't available.", ["model"]],
  [/^Connected to (.+) and signed in\. Reminders can be sent\.$/, "Connected to {server} and signed in. Reminders can be sent.", ["server"]],
  [/^Connected to (.+)\. Reminders can be sent\.$/, "Connected to {server}. Reminders can be sent.", ["server"]],
  [/^Prices load\. SPY closed at (.+) on (.+)\.$/, "Prices load. SPY closed at {close} on {date}.", ["close", "date"]],
  [/^Could not reach the service: ([\s\S]*)$/, "Could not reach the service: {detail}", ["detail"]],
  [/^(.+) must be on or off$/, "{field} must be on or off", ["field"]],
  [/^(.+) can't be empty; clear it to use \.env instead$/, "{field} can't be empty; clear it to use .env instead", ["field"]],
  [/^(.+) is too long$/, "{field} is too long", ["field"]],
  [/^(.+) must include an email address$/, "{field} must include an email address", ["field"]],
];

/** Translates the field names Stripe's test lists as still missing. */
function translateStripe(t: Translate, message: string): string | null {
  const match = /^Key works \((test|live) mode\)\.(?: Still to add: (.+)\.)?$/.exec(message);
  if (!match) return null;
  const works = t(match[1] === "test" ? "Key works (test mode)." : "Key works (live mode).");
  if (!match[2]) return works;
  const items = match[2].split(", ").map((item) => t(item)).join(", ");
  return `${works} ${t("Still to add: {items}.", { items })}`;
}

function translateConnectionMessage(t: Translate, message: string): string {
  const stripe = translateStripe(t, message);
  if (stripe !== null) return stripe;
  for (const [pattern, template, names] of MESSAGE_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      const vars = Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
      if ("field" in vars) vars.field = t(vars.field);
      return t(template, vars);
    }
  }
  return t(message);
}

/** Admin: set up and test the outside services the app depends on. */
export function AdminConnections() {
  const t = useT();
  const [connections, setConnections] = useState<ConnectionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  useEffect(() => {
    let active = true;
    api<ConnectionInfo[]>("/api/admin/connections")
      .then((rows) => {
        if (active) setConnections(rows);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load connections"); // translated when shown
      });
    return () => {
      active = false;
    };
  }, []);

  function replace(updated: ConnectionInfo) {
    setConnections((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
  }

  function recordTest(id: string, result: TestResult) {
    setConnections((current) => current?.map((item) => (item.id === id ? { ...item, last_test: result } : item)) ?? null);
  }

  async function testAll() {
    if (!connections) return;
    setTestingAll(true);
    await Promise.all(
      connections.map(async (connection) => {
        try {
          recordTest(connection.id, await api<TestResult>(`/api/admin/connections/${connection.id}/test`, { method: "POST" }));
        } catch (cause) {
          recordTest(connection.id, {
            ok: false,
            message: cause instanceof Error ? cause.message : t("Test failed"),
            ms: 0,
            tested_at: new Date().toISOString(),
          });
        }
      }),
    );
    setTestingAll(false);
  }

  return (
    <section className="simple-page admin-page admin-connections" aria-labelledby="admin-connections-title">
      <div className="page-heading">
        <div>
          <h1 id="admin-connections-title">{t("Connections")}</h1>
          <p className="page-subtitle">{t("Outside services MyPortfolioBuddy uses. Values saved here override the server config (.env).")}</p>
        </div>
        <button type="button" className="button primary admin-education-add" onClick={() => void testAll()} disabled={!connections || testingAll}>
          <PlugZap size={16} aria-hidden="true" />
          {testingAll ? t("Testing…") : t("Test all")}
        </button>
      </div>
      {error && (
        <div className="alert" role="alert">
          {translateConnectionMessage(t, error)}
        </div>
      )}
      {!connections && !error ? (
        <p className="muted">{t("Loading connections…")}</p>
      ) : (
        <div className="connection-grid">
          {connections?.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} onSaved={replace} onTested={(result) => recordTest(connection.id, result)} />
          ))}
        </div>
      )}
    </section>
  );
}

function Status({ connection }: { connection: ConnectionInfo }) {
  const t = useT();
  const test = connection.last_test;
  if (test) {
    return test.ok ? (
      <span className="connection-status ok">
        <CircleCheck size={14} aria-hidden="true" /> {t("Working")}
      </span>
    ) : (
      <span className="connection-status bad">
        <CircleAlert size={14} aria-hidden="true" /> {t("Not working")}
      </span>
    );
  }
  if (connection.configurable && !connection.configured) {
    return (
      <span className="connection-status warn">
        <CircleAlert size={14} aria-hidden="true" /> {t("Not set up")}
      </span>
    );
  }
  return (
    <span className="connection-status idle">
      <CircleDashed size={14} aria-hidden="true" /> {t("Not tested")}
    </span>
  );
}

function ConnectionCard({
  connection,
  onSaved,
  onTested,
}: {
  connection: ConnectionInfo;
  onSaved: (connection: ConnectionInfo) => void;
  onTested: (result: TestResult) => void;
}) {
  const t = useT();
  // Only changed fields are sent; secrets start empty and keep their saved value unless typed.
  const [changes, setChanges] = useState<Record<string, string | boolean | null>>({});
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = Object.keys(changes).length > 0;

  function valueOf(field: ConnectionField) {
    if (field.key in changes) return changes[field.key];
    if (field.kind === "secret") return "";
    return field.value ?? "";
  }

  async function test() {
    setBusy("test");
    try {
      onTested(await api<TestResult>(`/api/admin/connections/${connection.id}/test`, { method: "POST" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Test failed"));
    } finally {
      setBusy(null);
    }
  }

  async function save(values: Record<string, string | boolean | null>, thenTest: boolean) {
    setBusy("save");
    setError(null);
    try {
      const saved = await api<ConnectionInfo>(`/api/admin/connections/${connection.id}`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
      onSaved(saved);
      setChanges({});
      setBusy(null);
      if (thenTest) await test();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save"));
      setBusy(null);
    }
  }

  const adminFields = connection.fields.filter((field) => field.source === "admin");

  return (
    <article className="panel connection-card" aria-labelledby={`connection-${connection.id}`}>
      <header>
        <h2 id={`connection-${connection.id}`}>{t(connection.name)}</h2>
        <Status connection={connection} />
      </header>
      <p className="muted connection-purpose">{t(connection.purpose)}</p>
      {connection.configurable && (
        <form
          className="connection-fields"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty) void save(changes, true);
          }}
        >
          {connection.fields.map((field) => {
            const value = valueOf(field);
            const id = `${connection.id}-${field.key}`;
            return field.kind === "bool" ? (
              <label key={field.key} className="connection-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => setChanges((current) => ({ ...current, [field.key]: event.target.checked }))}
                />
                {t(field.label)}
                <span className={`connection-source ${field.source}`}>{t(SOURCE_LABEL[field.source])}</span>
              </label>
            ) : (
              <div key={field.key} className="connection-field">
                <label htmlFor={id}>
                  {t(field.label)}
                  <span className={`connection-source ${field.source}`}>{t(SOURCE_LABEL[field.source])}</span>
                </label>
                <input
                  id={id}
                  type={field.kind === "secret" ? "password" : field.kind === "port" ? "number" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  value={String(value ?? "")}
                  placeholder={
                    field.kind === "secret" && field.hint
                      ? t("Saved: {hint} (type to replace)", { hint: field.hint })
                      : t(field.placeholder)
                  }
                  onChange={(event) => setChanges((current) => ({ ...current, [field.key]: event.target.value }))}
                />
                {field.unreadable && <small className="alert-text">{t("The saved value can't be read anymore; enter it again.")}</small>}
                {field.help && <small className="muted">{t(field.help)}</small>}
              </div>
            );
          })}
          {error && (
            <p className="alert" role="alert">
              {translateConnectionMessage(t, error)}
            </p>
          )}
          <div className="connection-actions">
            <button type="submit" className="button primary" disabled={!dirty || busy !== null}>
              {busy === "save" ? t("Saving…") : t("Save & test")}
            </button>
            <button type="button" className="button" onClick={() => void test()} disabled={busy !== null}>
              {busy === "test" ? t("Testing…") : t("Test")}
            </button>
            {dirty && (
              <button type="button" className="text-button" onClick={() => setChanges({})}>
                {t("Discard changes")}
              </button>
            )}
            {!dirty && adminFields.length > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (window.confirm(t("Remove the values saved in Admin for {name} and use the server config instead?", { name: t(connection.name) }))) {
                    void save(Object.fromEntries(adminFields.map((field) => [field.key, null])), true);
                  }
                }}
              >
                {t("Use server config")}
              </button>
            )}
          </div>
        </form>
      )}
      {!connection.configurable && (
        <div className="connection-actions">
          <button type="button" className="button" onClick={() => void test()} disabled={busy !== null}>
            {busy === "test" ? t("Testing…") : t("Test")}
          </button>
        </div>
      )}
      {connection.last_test && (
        <p className={`connection-result ${connection.last_test.ok ? "ok" : "bad"}`} role="status">
          {translateConnectionMessage(t, connection.last_test.message)}
          {connection.last_test.ms > 0 && <span className="muted"> · {t("{ms} ms", { ms: connection.last_test.ms })}</span>}
        </p>
      )}
    </article>
  );
}
