"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

import { api } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export type ReportReminder = {
  id: string;
  ticker: string;
  company_name: string | null;
  last_report_date: string | null;
  remind_on: string;
  status: "pending" | "sent" | "failed";
};

const QUARTER_DAYS = 91;
const LEAD_DAYS = 3;

function addDays(isoDate: string, days: number) {
  const value = new Date(`${isoDate}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function estimatedNextReport(lastReport: string) {
  return addDays(lastReport, QUARTER_DAYS);
}

/** A few days before the estimated report, but never before tomorrow. */
export function defaultReminderDate(lastReport: string, today: string) {
  const suggested = addDays(estimatedNextReport(lastReport), -LEAD_DAYS);
  const tomorrow = addDays(today, 1);
  return suggested > tomorrow ? suggested : tomorrow;
}

export function ReportReminderDialog({
  ticker,
  companyName,
  lastReportDate,
  portfolioId,
  email,
  today,
  emailEnabled,
  onClose,
}: {
  ticker: string;
  companyName: string | null;
  lastReportDate: string;
  portfolioId: string | null;
  email: string;
  today: string;
  emailEnabled: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [remindOn, setRemindOn] = useState(() =>
    defaultReminderDate(lastReportDate, today),
  );
  const [existing, setExisting] = useState<ReportReminder[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReportReminder | null>(null);
  const expected = estimatedNextReport(lastReportDate);

  useEffect(() => {
    let active = true;
    api<ReportReminder[]>("/api/reminders")
      .then((rows) => {
        if (active) {
          setExisting(
            rows.filter((row) => row.ticker === ticker && row.status === "pending"),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ticker]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const created = await api<ReportReminder>("/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          remind_on: remindOn,
          portfolio_id: portfolioId,
          company_name: companyName,
          last_report_date: lastReportDate,
        }),
      });
      setSaved({ ...created, remind_on: remindOn });
      setExisting((current) => [...current, { ...created, remind_on: remindOn }]);
    } catch (cause) {
      setError(cause instanceof Error ? t(cause.message) : t("Could not save the reminder"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api(`/api/reminders/${id}`, { method: "DELETE" });
      setExisting((current) => current.filter((row) => row.id !== id));
      if (saved?.id === id) setSaved(null);
    } catch (cause) {
      setError(cause instanceof Error ? t(cause.message) : t("Could not cancel the reminder"));
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
      <section
        className="add-holding-modal reminder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-title"
      >
        <div className="modal-heading">
          <h2 id="reminder-title">{t("Report reminder for {ticker}", { ticker })}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-fields">
          <dl className="reminder-facts">
            <div>
              <dt>{t("Last SEC report")}</dt>
              <dd>{lastReportDate}</dd>
            </div>
            <div>
              <dt>{t("Next report expected")}</dt>
              <dd>
                {expected < today
                  ? t("any day now (estimated {date})", { date: expected })
                  : t("around {date}", { date: expected })}
              </dd>
            </div>
          </dl>
          <p className="reminder-note">
            {t(
              "Companies usually file every three months, so this date is an estimate. The company announces the exact date.",
            )}
          </p>

          {saved ? (
            <p className="notice" role="status">
              {t("Reminder set. We’ll email {email} on {date}.", { email, date: saved.remind_on })}
            </p>
          ) : (
            <>
              <label>
                {t("Email me on")}
                <input
                  type="date"
                  min={addDays(today, 0)}
                  value={remindOn}
                  onChange={(event) => setRemindOn(event.target.value)}
                />
              </label>
              <label>
                {t("Send to")}
                <input value={email} readOnly aria-readonly="true" />
              </label>
              {!emailEnabled && (
                <p className="reminder-note" role="note">
                  {t(
                    "Email sending isn’t set up on this server yet. Your reminder will be saved and sent once it is.",
                  )}
                </p>
              )}
              <button
                type="button"
                className="button primary reminder-submit"
                disabled={saving || !remindOn}
                onClick={() => void save()}
              >
                <BellRing size={16} aria-hidden="true" />
                {saving ? t("Saving…") : t("Send me a reminder")}
              </button>
            </>
          )}

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          {existing.length > 0 && (
            <div className="reminder-list">
              <h3>{t("Scheduled reminders for {ticker}", { ticker })}</h3>
              <ul>
                {existing.map((row) => (
                  <li key={row.id}>
                    <span>{row.remind_on}</span>
                    <button type="button" onClick={() => void remove(row.id)}>
                      {t("Cancel reminder")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
