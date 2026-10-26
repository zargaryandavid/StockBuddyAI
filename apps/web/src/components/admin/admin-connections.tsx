"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, CircleDashed, PlugZap } from "lucide-react";

import { api } from "@/lib/api";

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

/** Admin: set up and test the outside services the app depends on. */
export function AdminConnections() {
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
        if (active) setError(cause instanceof Error ? cause.message : "Could not load connections");
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
            message: cause instanceof Error ? cause.message : "Test failed",
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
          <h1 id="admin-connections-title">Connections</h1>
          <p className="page-subtitle">Outside services StockBuddy uses. Values saved here override the server config (.env).</p>
        </div>
        <button type="button" className="button primary admin-education-add" onClick={() => void testAll()} disabled={!connections || testingAll}>
          <PlugZap size={16} aria-hidden="true" />
          {testingAll ? "Testing…" : "Test all"}
        </button>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {!connections && !error ? (
        <p className="muted">Loading connections…</p>
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
  const test = connection.last_test;
  if (test) {
    return test.ok ? (
      <span className="connection-status ok">
        <CircleCheck size={14} aria-hidden="true" /> Working
      </span>
    ) : (
      <span className="connection-status bad">
        <CircleAlert size={14} aria-hidden="true" /> Not working
      </span>
    );
  }
  if (connection.configurable && !connection.configured) {
    return (
      <span className="connection-status warn">
        <CircleAlert size={14} aria-hidden="true" /> Not set up
      </span>
    );
  }
  return (
    <span className="connection-status idle">
      <CircleDashed size={14} aria-hidden="true" /> Not tested
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
      setError(cause instanceof Error ? cause.message : "Test failed");
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
      setError(cause instanceof Error ? cause.message : "Could not save");
      setBusy(null);
    }
  }

  const adminFields = connection.fields.filter((field) => field.source === "admin");

  return (
    <article className="panel connection-card" aria-labelledby={`connection-${connection.id}`}>
      <header>
        <h2 id={`connection-${connection.id}`}>{connection.name}</h2>
        <Status connection={connection} />
      </header>
      <p className="muted connection-purpose">{connection.purpose}</p>
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
                {field.label}
                <span className={`connection-source ${field.source}`}>{SOURCE_LABEL[field.source]}</span>
              </label>
            ) : (
              <div key={field.key} className="connection-field">
                <label htmlFor={id}>
                  {field.label}
                  <span className={`connection-source ${field.source}`}>{SOURCE_LABEL[field.source]}</span>
                </label>
                <input
                  id={id}
                  type={field.kind === "secret" ? "password" : field.kind === "port" ? "number" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  value={String(value ?? "")}
                  placeholder={field.kind === "secret" ? (field.hint ? `Saved: ${field.hint} (type to replace)` : field.placeholder) : field.placeholder}
                  onChange={(event) => setChanges((current) => ({ ...current, [field.key]: event.target.value }))}
                />
                {field.unreadable && <small className="alert-text">The saved value can&apos;t be read anymore; enter it again.</small>}
                {field.help && <small className="muted">{field.help}</small>}
              </div>
            );
          })}
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <div className="connection-actions">
            <button type="submit" className="button primary" disabled={!dirty || busy !== null}>
              {busy === "save" ? "Saving…" : "Save & test"}
            </button>
            <button type="button" className="button" onClick={() => void test()} disabled={busy !== null}>
              {busy === "test" ? "Testing…" : "Test"}
            </button>
            {dirty && (
              <button type="button" className="text-button" onClick={() => setChanges({})}>
                Discard changes
              </button>
            )}
            {!dirty && adminFields.length > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (window.confirm(`Remove the values saved in Admin for ${connection.name} and use the server config instead?`)) {
                    void save(Object.fromEntries(adminFields.map((field) => [field.key, null])), true);
                  }
                }}
              >
                Use server config
              </button>
            )}
          </div>
        </form>
      )}
      {!connection.configurable && (
        <div className="connection-actions">
          <button type="button" className="button" onClick={() => void test()} disabled={busy !== null}>
            {busy === "test" ? "Testing…" : "Test"}
          </button>
        </div>
      )}
      {connection.last_test && (
        <p className={`connection-result ${connection.last_test.ok ? "ok" : "bad"}`} role="status">
          {connection.last_test.message}
          {connection.last_test.ms > 0 && <span className="muted"> · {connection.last_test.ms} ms</span>}
        </p>
      )}
    </article>
  );
}
