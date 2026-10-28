import { errorDetail } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export type Portfolio = {
  id: string;
  name: string;
  cash: number;
  base_currency?: string;
  benchmark?: string;
  max_position_pct?: number | null;
  max_sector_pct?: number | null;
  min_cash_pct?: number;
  /** Cash in currencies other than base_currency. */
  other_cash?: { currency: string; amount: number }[];
  time_horizon?: "Short Term" | "Medium Term" | "Long Term";
  rebalancing_threshold_pct?: number;
  portfolio_positions: import("@/lib/portfolio").Position[];
};

export type PortfolioTransaction = {
  id: string;
  portfolio_id: string;
  ticker: string;
  kind: "buy" | "sell";
  quantity: number;
  price: number;
  transacted_at: string;
  created_at: string;
};

export type AnalysisRun = {
  id: string;
  portfolio_id: string;
  ticker: string;
  as_of: string;
  status: "pending" | "running" | "completed" | "failed";
  error: string | null;
  analysis_signals?: Signal[];
  recommendations?: Recommendation[];
};

export type Signal = {
  strategy: string;
  persona: string;
  ticker: string;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  value: number;
  reasoning: string;
  abstained: boolean;
};

export type Recommendation = {
  ticker: string;
  label: "sell" | "hold" | "add" | "trim";
  current_weight: number;
  target_weight: number;
  delta_shares: number;
  mark: number;
};

/*
 * Recent answers, so going back to a page shows it at once instead of waiting on the
 * server again. Only page data is kept, never live progress (Ask Buddy runs, usage).
 * Any change (POST, PUT, PATCH, DELETE) clears it, so nothing shows out of date after
 * an edit; market data is kept a little longer because edits don't change it.
 */
const PAGE_DATA = [
  "/api/me",
  "/api/settings",
  "/api/portfolios",
  "/api/profile",
  "/api/fire/",
  "/api/wishes",
  "/api/education/articles",
  "/api/books/ratings",
  "/api/share-links",
  "/api/reminders",
];
const MARKET_DATA = [
  "/api/prices/history",
  "/api/fx",
  "/api/securities/resolve-batch",
  "/api/funds/holdings",
];
const PAGE_TTL_MS = 60_000;
const MARKET_TTL_MS = 5 * 60_000;
const answers = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

function cacheTtl(path: string, method: string) {
  const route = path.split("?")[0];
  const matches = (prefixes: string[]) =>
    prefixes.some((prefix) => (prefix.endsWith("/") ? route.startsWith(prefix) : route === prefix));
  if (matches(MARKET_DATA)) return MARKET_TTL_MS; // the batch lookup reads, though it is a POST
  if (method === "GET" && matches(PAGE_DATA)) return PAGE_TTL_MS;
  return 0;
}

/** Forget every remembered answer (after sign-in, sign-out, or any change). */
export function clearApiCache({ keepMarketData = false } = {}) {
  for (const [key, entry] of answers) {
    if (!keepMarketData || entry.ttl !== MARKET_TTL_MS) answers.delete(key);
  }
}

/**
 * Where the browser sends API calls. On the live site the API is served from the same
 * address as the pages (Vercel routes /api to it), so calls stay on whichever domain the
 * person opened (www.myportfoliobuddy.com, the vercel.app address, a preview) and the
 * browser never blocks them as cross-site. On a developer's machine the API runs on its
 * own port, set by NEXT_PUBLIC_API_URL.
 */
export function apiBase() {
  const local = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  if (typeof window === "undefined") return local;
  const host = window.location.hostname;
  const developing = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local");
  return developing ? local : "";
}

const SESSION_ENDED = "Your session has expired. Please sign in again.";

/** Thrown for a 401: the server no longer accepts this sign-in. */
class SessionRejected extends Error {}

/** Where the browser goes when a session can't be renewed; replaceable in tests. */
export const sessionEnd = {
  // A full page load, so nothing from the ended session stays in memory.
  goToSignIn: () => window.location.replace(new URL("/login?confirm=session-ended", window.location.origin).href),
};

let ending = false;
let renewing: Promise<string | null> | null = null;

/** One renewal for all the requests that were turned away at the same moment. */
function renewSession(): Promise<string | null> {
  renewing ??= createClient()
    .auth.refreshSession()
    .then(({ data, error }) => (error ? null : (data.session?.access_token ?? null)))
    .catch(() => null)
    .finally(() => {
      renewing = null;
    });
  return renewing;
}

/** Signs out on this device and opens the sign-in page with a friendly note, once. */
async function endSession(): Promise<never> {
  if (!ending) {
    ending = true;
    clearApiCache();
    await createClient().auth.signOut({ scope: "local" }).catch(() => undefined);
    sessionEnd.goToSignIn();
  }
  throw new Error(SESSION_ENDED);
}

/**
 * Runs a request with the current sign-in. If the server turns it away (the session expired
 * or was ended elsewhere), renews the session once and tries again; if that fails too, the
 * person is signed out and sent to sign in, instead of every page showing an error.
 */
async function withSession<T>(run: (token: string) => Promise<T>, token: string): Promise<T> {
  try {
    return await run(token);
  } catch (cause) {
    if (!(cause instanceof SessionRejected)) throw cause;
    const renewed = await renewSession();
    if (!renewed) return endSession();
    try {
      return await run(renewed);
    } catch (again) {
      if (again instanceof SessionRejected) return endSession();
      throw again;
    }
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return endSession();
  const method = (init?.method ?? "GET").toUpperCase();
  const ttl = cacheTtl(path, method);
  if (!ttl) {
    if (method !== "GET") clearApiCache({ keepMarketData: true });
    return withSession((token) => request<T>(path, init, token), data.session.access_token);
  }
  // Answers belong to one person.
  const key = `${data.session.user.id} ${method} ${path} ${typeof init?.body === "string" ? init.body : ""}`;
  const cached = answers.get(key);
  if (cached && init?.cache !== "reload" && Date.now() - cached.at < cached.ttl) {
    return cached.value as Promise<T>;
  }
  const fetchInit = { ...init };
  delete fetchInit.cache; // "reload" only means "skip what we remember"
  const value = withSession((token) => request<T>(path, fetchInit, token), data.session.access_token);
  answers.set(key, { at: Date.now(), ttl, value });
  // A failed answer is not kept, so the next visit tries again.
  value.catch(() => {
    if (answers.get(key)?.value === value) answers.delete(key);
  });
  return value;
}

async function request<T>(path: string, init: RequestInit | undefined, token: string): Promise<T> {
  const response = await fetch(
    `${apiBase()}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) throw new SessionRejected(errorDetail(body.detail, response.status));
    throw new Error(errorDetail(body.detail, response.status));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  clearApiCache({ keepMarketData: true });
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return endSession();
  return withSession(async (token) => {
    const response = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) throw new SessionRejected(errorDetail(payload.detail, response.status));
      throw new Error(errorDetail(payload.detail, response.status));
    }
    return response.json() as Promise<T>;
  }, data.session.access_token);
}

