import Papa from "papaparse";

export const assetTypes = [
  "Common Stock",
  "Preferred Stock",
  "ADR",
  "REIT",
  "ETF",
  "Mutual Fund",
  "Closed-End Fund",
  "Trust",
  "Index",
  "Other",
] as const;

export const sectors = [
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Information Technology",
  "Materials",
  "Real Estate",
  "Utilities",
  "Not Applicable",
  "Unknown",
] as const;

export const investmentCategories = [
  "Broad Market",
  "Sector",
  "International",
  "Fixed Income",
  "Commodity",
  "Digital Asset",
  "Thematic",
  "Other",
] as const;

export const lifecyclePhases = [
  "Startup",
  "Hyper Growth",
  "Operating Leverage",
  "Capital Return",
  "Decline",
  "Not Analyzed",
  "Not Applicable",
] as const;

export type Position = {
  ticker: string;
  shares: number;
  purchase_price?: number | null;
  name?: string;
  price?: number | null;
  growth?: number | null;
  growth_1m?: number | null;
  growth_6m?: number | null;
  growth_1y?: number | null;
  sector?: string | null;
  market_cap_category?: string | null;
  geography?: string | null;
  currency?: string | null;
  price_date?: string | null;
  price_timestamp?: string | null;
  price_source?: string | null;
  previous_close?: number | null;
  day_change?: number | null;
  day_change_percent?: number | null;
  raw_price?: number | null;
  quote_currency?: string | null;
  base_currency?: string | null;
  fx_rate?: number | null;
  is_etf_index?: boolean;
  display_order?: number;
  company_name?: string | null;
  asset_type?: (typeof assetTypes)[number];
  industry?: string | null;
  investment_category?: (typeof investmentCategories)[number] | null;
  classification_source?: "automatic" | "manual";
  lifecycle_phase?: (typeof lifecyclePhases)[number];
  lifecycle_evidence?: Record<string, unknown>;
  lifecycle_updated_at?: string | null;
  report_date?: string | null;
  report_source?: string | null;
  pe_ratio?: number | null;
  notes?: string | null;
  resolve_error?: string | null;
};

export type ImportColumnMap = {
  ticker: string;
  quantity: string;
  averageCost?: string;
};

export type ImportPreview = {
  positions: Position[];
  errors: string[];
  headers: string[];
  duplicateTickers: string[];
};

export function parsePortfolioCsvPreview(
  text: string,
  mapping?: ImportColumnMap,
): ImportPreview {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  const headers = (result.meta.fields ?? []).filter(Boolean);
  const columns = mapping ?? {
    ticker: headers.includes("ticker") ? "ticker" : headers.includes("symbol") ? "symbol" : "",
    quantity: headers.includes("quantity") ? "quantity" : "shares",
    averageCost: headers.includes("average cost")
      ? "average cost"
      : headers.includes("purchase_price")
        ? "purchase_price"
        : "purchase price",
  };
  const errors = result.errors.map((error) => error.message);
  const positions: Position[] = [];
  result.data.forEach((row, index) => {
    const ticker = String(row[columns.ticker] ?? "").trim().toUpperCase();
    const shares = Number(row[columns.quantity]);
    const rawPurchasePrice = columns.averageCost
      ? row[columns.averageCost] ?? ""
      : "";
    const purchasePrice = rawPurchasePrice === "" ? null : Number(rawPurchasePrice);
    if (!ticker || !/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
      errors.push(`Row ${index + 2}: invalid ticker`);
      return;
    }
    if (!Number.isInteger(shares) || shares < 0) {
      errors.push(`Row ${index + 2}: quantity must be a non-negative whole number`);
      return;
    }
    if (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) {
      errors.push(`Row ${index + 2}: purchase price must be a non-negative number`);
      return;
    }
    positions.push(
      purchasePrice === null
        ? { ticker, shares }
        : { ticker, shares, purchase_price: purchasePrice },
    );
  });
  const counts = new Map<string, number>();
  positions.forEach((position) =>
    counts.set(position.ticker, (counts.get(position.ticker) ?? 0) + 1),
  );
  const duplicateTickers = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ticker]) => ticker);
  return { positions, errors, headers, duplicateTickers };
}

export function parsePortfolioCsv(text: string): Position[] {
  const preview = parsePortfolioCsvPreview(text);
  if (preview.errors.length) throw new Error(preview.errors[0]);
  if (!preview.positions.length) throw new Error("CSV must include at least one position");
  if (preview.duplicateTickers.length) throw new Error("CSV contains duplicate tickers");
  const positions = preview.positions;
  return positions;
}

export function combinePositions(existing: Position, incoming: Position): Position {
  const existingQuantity = Number(existing.shares);
  const incomingQuantity = Number(incoming.shares);
  const quantity = existingQuantity + incomingQuantity;
  const existingCost = existing.purchase_price;
  const incomingCost = incoming.purchase_price;
  const purchasePrice =
    quantity > 0 && existingCost != null && incomingCost != null
      ? (existingQuantity * existingCost + incomingQuantity * incomingCost) / quantity
      : existingCost ?? incomingCost ?? null;
  return { ...existing, shares: quantity, purchase_price: purchasePrice };
}
