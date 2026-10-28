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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  const method = (init?.method ?? "GET").toUpperCase();
  const ttl = cacheTtl(path, method);
  if (!ttl) {
    if (method !== "GET") clearApiCache({ keepMarketData: true });
    return request<T>(path, init, data.session.access_token);
  }
  // Answers belong to one person.
  const key = `${data.session.user.id} ${method} ${path} ${typeof init?.body === "string" ? init.body : ""}`;
  const cached = answers.get(key);
  if (cached && init?.cache !== "reload" && Date.now() - cached.at < cached.ttl) {
    return cached.value as Promise<T>;
  }
  const fetchInit = { ...init };
  delete fetchInit.cache; // "reload" only means "skip what we remember"
  const value = request<T>(path, fetchInit, data.session.access_token);
  answers.set(key, { at: Date.now(), ttl, value });
  // A failed answer is not kept, so the next visit tries again.
  value.catch(() => {
    if (answers.get(key)?.value === value) answers.delete(key);
  });
  return value;
}

async function request<T>(path: string, init: RequestInit | undefined, token: string): Promise<T> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"}${path}`,
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
  if (!data.session) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"}${path}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      body,
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(errorDetail(payload.detail, response.status));
  }
  return response.json() as Promise<T>;
}

