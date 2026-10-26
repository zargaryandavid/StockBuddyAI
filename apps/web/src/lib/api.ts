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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
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

