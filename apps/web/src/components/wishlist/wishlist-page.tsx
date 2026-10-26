"use client";

import { FormEvent, useEffect, useState, type DragEvent, type KeyboardEvent } from "react";
import { Check, GripVertical, Pencil, Sparkles, Trash2, X } from "lucide-react";

import { api } from "@/lib/api";

export type WishList = "short" | "long" | "want" | "exercise";

export type Wish = {
  id: string;
  list: WishList;
  text: string;
  done: boolean;
  position?: number;
  created_at?: string;
};

type WishMatch = { id: string; text: string; reason: string };
type CheckResult = { source: "exact" | "ai" | "basic" | "limit"; matches: WishMatch[] };

export const EXERCISE_GOAL = 300;

const COLUMNS: Record<"short" | "long" | "want", { title: string; horizon: string; placeholder: string }> = {
  short: { title: "Short term", horizon: "Within 1 year", placeholder: "e.g. Take a week off at the sea" },
  long: { title: "Long term", horizon: "1–5 years", placeholder: "e.g. Buy an apartment" },
  want: { title: "Want", horizon: "Anytime", placeholder: "e.g. A good camera" },
};

/**
 * Drag a row by its grip (or press the up and down arrow keys on the grip) to move it.
 * Calls `onMove(from, to)` with list indexes.
 */
function useDragSort(onMove: (from: number, to: number) => void) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const reset = () => {
    setDragFrom(null);
    setDragOver(null);
  };
  return {
    rowClass: (index: number) =>
      `${dragFrom === index ? "dragging" : ""}${dragOver === index && dragFrom !== index ? " drop-target" : ""}`.trim(),
    rowProps: (index: number) => ({
      onDragOver: (event: DragEvent) => {
        if (dragFrom == null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOver(index);
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (dragFrom != null && dragFrom !== index) onMove(dragFrom, index);
        reset();
      },
    }),
    handleProps: (index: number, count: number) => ({
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDragFrom(index);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
        const row = event.currentTarget.closest("li");
        if (row) event.dataTransfer.setDragImage(row, 16, 16);
      },
      onDragEnd: reset,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const to = index + (event.key === "ArrowUp" ? -1 : 1);
        if (to >= 0 && to < count) onMove(index, to);
      },
    }),
  };
}

function DragHandle(props: ReturnType<ReturnType<typeof useDragSort>["handleProps"]> & { label: string }) {
  const { label, ...handlers } = props;
  return (
    <button type="button" className="wish-icon wish-grip" aria-label={`Move ${label}. Drag, or use the up and down arrow keys.`} title="Drag to reorder" {...handlers}>
      <GripVertical size={15} aria-hidden="true" />
    </button>
  );
}

/** Short- and long-term wishes, plus the "300 wishes" exercise with a repeat check. */
export function WishlistPage() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"lists" | "exercise">("lists");

  useEffect(() => {
    let active = true;
    api<Wish[]>("/api/wishes")
      .then((rows) => {
        if (active) setWishes(Array.isArray(rows) ? rows : []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your wishes");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function add(list: WishList, text: string) {
    const saved = await api<Wish>("/api/wishes", { method: "POST", body: JSON.stringify({ list, text }) });
    setWishes((current) => [...current, saved]);
  }

  async function update(wish: Wish, patch: Partial<Pick<Wish, "text" | "done">>) {
    const saved = await api<Wish>(`/api/wishes/${wish.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setWishes((current) => current.map((item) => (item.id === wish.id ? { ...item, ...saved } : item)));
  }

  async function remove(wish: Wish) {
    setError(null);
    try {
      await api(`/api/wishes/${wish.id}`, { method: "DELETE" });
      setWishes((current) => current.filter((item) => item.id !== wish.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the wish");
    }
  }

  async function toggle(wish: Wish) {
    setError(null);
    // Tick right away; put it back if saving fails.
    setWishes((current) => current.map((item) => (item.id === wish.id ? { ...item, done: !wish.done } : item)));
    try {
      await update(wish, { done: !wish.done });
    } catch (cause) {
      setWishes((current) => current.map((item) => (item.id === wish.id ? { ...item, done: wish.done } : item)));
      setError(cause instanceof Error ? cause.message : "Could not update the wish");
    }
  }

  /** Moves a wish within its list, shows it at once, and saves the new order. */
  async function move(list: WishList, from: number, to: number) {
    const before = wishes;
    const items = wishes.filter((wish) => wish.list === list);
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    setWishes([...wishes.filter((wish) => wish.list !== list), ...items]);
    setError(null);
    try {
      await api("/api/wishes/order", { method: "PUT", body: JSON.stringify({ list, ids: items.map((wish) => wish.id) }) });
    } catch (cause) {
      setWishes(before);
      setError(cause instanceof Error ? cause.message : "Could not save the new order");
    }
  }

  const exercise = wishes.filter((wish) => wish.list === "exercise");

  return (
    <section className="wishlist-page" aria-labelledby="wishlist-title">
      <header className="wishlist-head">
        <div>
          <h1 id="wishlist-title">Wishlist</h1>
          <p className="muted page-subtitle">What you want within a year, in five years, anytime, and the 300 wishes exercise.</p>
        </div>
        <div className="segmented" role="group" aria-label="Wishlist sections">
          <button type="button" className={section === "lists" ? "active" : ""} aria-pressed={section === "lists"} onClick={() => setSection("lists")}>
            My lists
          </button>
          <button type="button" className={section === "exercise" ? "active" : ""} aria-pressed={section === "exercise"} onClick={() => setSection("exercise")}>
            300 wishes
          </button>
        </div>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p className="muted">Loading your wishes…</p>
      ) : section === "lists" ? (
        <div className="wishlist-columns">
          {(["short", "long", "want"] as const).map((list) => (
            <WishColumn
              key={list}
              list={list}
              wishes={wishes.filter((wish) => wish.list === list)}
              onAdd={(text) => add(list, text)}
              onEdit={(wish, text) => update(wish, { text })}
              onToggle={toggle}
              onRemove={remove}
              onMove={(from, to) => void move(list, from, to)}
            />
          ))}
        </div>
      ) : (
        <Exercise
          wishes={exercise}
          onAdd={(text) => add("exercise", text)}
          onEdit={(wish, text) => update(wish, { text })}
          onRemove={remove}
          onMove={(from, to) => void move("exercise", from, to)}
        />
      )}
    </section>
  );
}

function WishColumn({
  list,
  wishes,
  onAdd,
  onEdit,
  onToggle,
  onRemove,
  onMove,
}: {
  list: "short" | "long" | "want";
  wishes: Wish[];
  onAdd: (text: string) => Promise<void>;
  onEdit: (wish: Wish, text: string) => Promise<void>;
  onToggle: (wish: Wish) => void;
  onRemove: (wish: Wish) => void;
  onMove: (from: number, to: number) => void;
}) {
  const drag = useDragSort(onMove);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const { title, horizon, placeholder } = COLUMNS[list];
  const done = wishes.filter((wish) => wish.done).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return setError("Write a wish first.");
    setSaving(true);
    setError(null);
    try {
      await onAdd(text.trim());
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the wish");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(wish: Wish) {
    const value = editing?.text.trim() ?? "";
    if (!value) return setError("A wish can't be empty.");
    if (value === wish.text) return setEditing(null);
    setError(null);
    try {
      await onEdit(wish, value);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the wish");
    }
  }

  return (
    <section className="panel wish-column" aria-labelledby={`wish-${list}-title`}>
      <div className="wish-column-head">
        <h2 id={`wish-${list}-title`}>{title}</h2>
        <span className="fire-list-count">{horizon}</span>
        {wishes.length > 0 && (
          <span className="muted wish-done-count">
            {done} of {wishes.length} done
          </span>
        )}
      </div>
      <form className="wish-add" onSubmit={submit} noValidate>
        <input
          aria-label={`New ${title.toLowerCase()} wish`}
          spellCheck
          value={text}
          maxLength={200}
          placeholder={placeholder}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
        />
        <button type="submit" className="button primary" disabled={saving}>
          Add
        </button>
      </form>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {wishes.length === 0 ? (
        <p className="muted">No wishes yet.</p>
      ) : (
        <ul className="wish-list">
          {wishes.map((wish, index) => (
            <li key={wish.id} className={`${wish.done ? "done " : ""}${drag.rowClass(index)}`.trim() || undefined} {...drag.rowProps(index)}>
              <DragHandle label={wish.text} {...drag.handleProps(index, wishes.length)} />
              {editing?.id === wish.id ? (
                <form
                  className="wish-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEdit(wish);
                  }}
                >
                  <input
                    aria-label={`Edit ${wish.text}`}
                    autoFocus
                    spellCheck
                    onFocus={(event) => event.currentTarget.select()}
                    value={editing.text}
                    maxLength={200}
                    onChange={(event) => setEditing({ id: wish.id, text: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditing(null);
                    }}
                  />
                  <button type="submit" className="wish-icon" aria-label="Save wish">
                    <Check size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="wish-icon" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X size={15} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={wish.done}
                      aria-label={wish.done ? `Mark "${wish.text}" not done` : `Mark "${wish.text}" done`}
                      onChange={() => onToggle(wish)}
                    />
                    <span>{wish.text}</span>
                  </label>
                  <button type="button" className="wish-icon" aria-label={`Edit ${wish.text}`} onClick={() => setEditing({ id: wish.id, text: wish.text })}>
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="wish-icon" aria-label={`Remove ${wish.text}`} onClick={() => onRemove(wish)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Exercise({
  wishes,
  onAdd,
  onEdit,
  onRemove,
  onMove,
}: {
  wishes: Wish[];
  onAdd: (text: string) => Promise<void>;
  onEdit: (wish: Wish, text: string) => Promise<void>;
  onRemove: (wish: Wish) => void;
  onMove: (from: number, to: number) => void;
}) {
  const drag = useDragSort(onMove);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repeats, setRepeats] = useState<CheckResult | null>(null);
  // Set when the AI check could not run, so the person knows only wording was compared.
  const [basicOnly, setBasicOnly] = useState<false | "basic" | "limit">(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const count = wishes.length;
  const full = count >= EXERCISE_GOAL;
  const number = new Map(wishes.map((wish, index) => [wish.id, index + 1]));

  /** Asks the API (Claude) whether the wish repeats one already on the list. */
  async function check(value: string, excludeId?: string) {
    return api<CheckResult>("/api/wishes/check", {
      method: "POST",
      body: JSON.stringify({ text: value, exclude_id: excludeId ?? null }),
    });
  }

  /** Adds the typed wish; with `force`, adds it even when it looks like a repeat. */
  async function addWish(force = false) {
    const value = text.trim();
    if (!value) return setError("Write a wish first.");
    setError(null);
    try {
      if (!force) {
        setBusy("check");
        const result = await check(value);
        setBasicOnly(result.source === "basic" || result.source === "limit" ? result.source : false);
        if (result.matches.length) {
          setRepeats(result);
          return;
        }
      }
      setBusy("save");
      await onAdd(value);
      setText("");
      setRepeats(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the wish");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(wish: Wish) {
    if (!editing) return;
    const value = editing.text.trim();
    if (!value || value === wish.text) return setEditing(null);
    setError(null);
    try {
      const result = await check(value, wish.id);
      const exact = result.source === "exact" && result.matches.length > 0;
      if (exact) {
        return setError(`"${value}" is already wish #${number.get(result.matches[0].id)}.`);
      }
      if (result.matches.length && !window.confirm(`This looks like: ${result.matches.map((match) => `#${number.get(match.id)} ${match.text}`).join(", ")}. Save anyway?`)) {
        return;
      }
      await onEdit(wish, value);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the wish");
    }
  }

  const exactRepeat = repeats?.source === "exact";

  return (
    <section className="panel wish-exercise" aria-labelledby="wish-exercise-title">
      <div className="wish-exercise-head">
        <div>
          <h2 id="wish-exercise-title">300 wishes</h2>
          <p className="muted">Write 300 different wishes, big and small. Every one must be new: repeats are caught as you add them.</p>
        </div>
        <strong className="wish-progress-count">
          {count} / {EXERCISE_GOAL}
        </strong>
      </div>
      <div
        className="fire-progress-bar"
        role="progressbar"
        aria-label="Wishes written"
        aria-valuemin={0}
        aria-valuemax={EXERCISE_GOAL}
        aria-valuenow={count}
      >
        <span style={{ width: `${Math.min(100, (count / EXERCISE_GOAL) * 100)}%` }} />
      </div>

      {full ? (
        <p className="notice">All 300 wishes are written. Edit any of them below.</p>
      ) : (
        <form
          className="wish-add"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void addWish();
          }}
        >
          <input
            aria-label="New wish"
            value={text}
            maxLength={200}
            placeholder={`Wish #${count + 1}`}
            onChange={(event) => {
              setText(event.target.value);
              setRepeats(null);
              setError(null);
            }}
          />
          <button type="submit" className="button primary" disabled={busy !== null}>
            {busy === "check" ? "Checking…" : busy === "save" ? "Adding…" : "Add"}
          </button>
        </form>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {basicOnly && !repeats && (
        <p className="muted wish-basic-note">
          {basicOnly === "limit"
            ? "You've used today's AI repeat checks, so only similar wording was compared until tomorrow."
            : "The AI repeat check isn't available right now, so only similar wording was compared."}
        </p>
      )}
      {repeats && (
        <div className="wish-repeat" role="status">
          <p>
            <Sparkles size={16} aria-hidden="true" />
            {exactRepeat ? "This wish is already on your list:" : "This looks like a wish you already have:"}
          </p>
          <ul>
            {repeats.matches.map((match) => (
              <li key={match.id}>
                <strong>
                  #{number.get(match.id)} {match.text}
                </strong>
                <span className="muted">{match.reason}</span>
              </li>
            ))}
          </ul>
          <div className="wish-repeat-actions">
            {!exactRepeat && (
              <button type="button" className="button" onClick={() => void addWish(true)}>
                It&apos;s different, add anyway
              </button>
            )}
            <button type="button" className="text-button" onClick={() => setRepeats(null)}>
              Change my wish
            </button>
          </div>
          <small className="muted">
            {repeats.source === "ai"
              ? "Checked by AI."
              : repeats.source === "basic"
                ? "AI check unavailable; compared the words."
                : repeats.source === "limit"
                  ? "Today's AI checks are used up; compared the words."
                  : ""}
          </small>
        </div>
      )}

      {wishes.length === 0 ? (
        <p className="muted">Start with anything: a place, a skill, a feeling, a thing.</p>
      ) : (
        <ol className="wish-numbered">
          {wishes.map((wish, index) => (
            <li key={wish.id} className={drag.rowClass(index) || undefined} {...drag.rowProps(index)}>
              <DragHandle label={wish.text} {...drag.handleProps(index, wishes.length)} />
              <span className="wish-number">{number.get(wish.id)}</span>
              {editing?.id === wish.id ? (
                <form
                  className="wish-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEdit(wish);
                  }}
                >
                  <input
                    aria-label={`Edit wish ${number.get(wish.id)}`}
                    autoFocus
                    value={editing.text}
                    maxLength={200}
                    onChange={(event) => setEditing({ id: wish.id, text: event.target.value })}
                  />
                  <button type="submit" className="wish-icon" aria-label="Save wish">
                    <Check size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="wish-icon" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X size={15} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <>
                  <span className="wish-text">{wish.text}</span>
                  <button type="button" className="wish-icon" aria-label={`Edit ${wish.text}`} onClick={() => setEditing({ id: wish.id, text: wish.text })}>
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="wish-icon" aria-label={`Remove ${wish.text}`} onClick={() => onRemove(wish)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
