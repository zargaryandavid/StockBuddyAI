/**
 * Parses a broker "positions" export (CSV / TSV / semicolon) into holdings.
 *
 * Pure and browser-safe: no I/O. Handles the quirks of real exports from Fidelity, Charles Schwab,
 * Vanguard, E*TRADE, Robinhood, Interactive Brokers and Webull, plus hand-made files: title lines
 * before the header, totals/pending/disclaimer lines after it, quoted fields, `$1,234.56`, `(12.34)`,
 * `--`, a BOM, `;` or tab delimiters, and cash / money-market rows (reported as `cash`, never as holdings).
 */

export type ImportedHolding = { ticker: string; shares: number; purchase_price: number | null };

export type SkippedLine = { line: number; reason: string; symbol?: string };

export type BrokerCsvResult = {
  rows: ImportedHolding[];
  skipped: SkippedLine[];
  /** Broker name when the file is recognisable, else null. */
  broker: string | null;
  /** Sum of the cash / money-market rows, or null when the file has none. */
  cash: number | null;
};

/** Fixed English reasons (also used as translation keys in the UI). */
export const SKIP_REASONS = {
  noHeader: "No header row with a symbol and a quantity column was found",
  option: "Options are not supported",
  invalidTicker: "Not a valid ticker symbol",
  missingShares: "Missing share quantity",
  nonPositive: "Short or zero positions are skipped",
  notStock: "Not a stock or fund position",
} as const;

type Delimiter = "," | ";" | "\t";
type CsvRecord = { line: number; cells: string[] };

type Field = "ticker" | "shares" | "avgCost" | "totalCost" | "value" | "description" | "secType" | "discriminator";

const ALIASES: Record<Field, string[]> = {
  ticker: ["symbol", "ticker", "tickersymbol", "instrument", "financialinstrument", "securitysymbol", "stocksymbol", "symbolcusip"],
  shares: ["quantity", "qty", "shares", "position", "totalqty", "totalquantity", "sharesheld", "quantityheld", "units"],
  avgCost: [
    "averagecost",
    "avgcost",
    "averagecostbasis",
    "costbasispershare",
    "costpershare",
    "costshare",
    "avgcostpershare",
    "averagecostpershare",
    "pricepaid",
    "averageprice",
    "avgprice",
    "costprice",
    "costbasisprice",
    "unitcost",
    "purchaseprice",
    "averagepurchaseprice",
    "avgpurchaseprice",
  ],
  totalCost: ["costbasistotal", "costbasis", "totalcost", "totalcostbasis", "costbasismoney", "bookcost", "bookvalue"],
  value: ["currentvalue", "marketvalue", "mktval", "mktvalue", "value", "totalvalue", "equity", "positionvalue"],
  description: ["description", "name", "investmentname", "securitydescription", "securityname", "instrumentname"],
  secType: ["securitytype", "assetcategory", "assetclass", "sectype", "instrumenttype", "assettype", "producttype"],
  discriminator: ["datadiscriminator"],
};

/** Columns that only appear in transaction/activity tables, never in a positions table. */
const TRANSACTION_COLUMNS = new Set([
  "tradedate",
  "settlementdate",
  "transactiontype",
  "transactiondescription",
  "action",
  "activity",
  "datetime",
  "rundate",
  "activitydate",
]);

/** Money-market / sweep funds that brokers use as the cash position. */
const CASH_TICKERS = new Set([
  "SPAXX",
  "FDRXX",
  "FZFXX",
  "SPRXX",
  "FZDXX",
  "FCASH",
  "CORE",
  "VMFXX",
  "VMMXX",
  "VUSXX",
  "SWVXX",
  "SNVXX",
  "SNOXX",
  "SWTXX",
  "SNSXX",
  "TTTXX",
  "CASH",
  "USD",
]);

const CASH_LABEL = /^(cash|cash\s*&\s*cash investments|cash and cash investments|cash & sweep|cash and sweep|money market|core|sweep|cash balance|brokerage cash)\b/i;
const CASH_DESCRIPTION = /money market|money mkt|held in money market|cash reserves|core position|sweep|federal money/i;
const TOTAL_LABEL = /^(account\s+total|grand\s+total|sub\s*total|total|positions?\s+total|pending\s+activity|pending)\b/i;
const EXCHANGES = /^(NASDAQ|NYSE|ARCA|NYSEARCA|AMEX|BATS|SMART|ISLAND|NMS|OTC|PINK|TSX|LSE|CBOE)$/;

function normHeader(raw: string): string {
  const withoutParens = raw.replace(/\([^)]*\)/g, " ");
  const base = withoutParens.trim() ? withoutParens : raw;
  return base.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Splits text into records, honouring quotes (with "" escapes and embedded newlines). */
function tokenize(text: string, delimiter: Delimiter): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      cell = "";
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n") {
      cells.push(cell);
      records.push({ line: recordLine, cells });
      cells = [];
      cell = "";
      line++;
      recordLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || cells.length) {
    cells.push(cell);
    records.push({ line: recordLine, cells });
  }
  return records.map((record) => ({ line: record.line, cells: record.cells.map((value) => value.trim()) }));
}

type Columns = Partial<Record<Field, number>> & { width: number; section: string | null };

function matchColumns(cells: string[]): Columns | null {
  const normalized = cells.map(normHeader);
  if (normalized.some((name) => TRANSACTION_COLUMNS.has(name))) return null;
  const columns: Columns = { width: cells.length, section: null };
  for (const field of Object.keys(ALIASES) as Field[]) {
    // Earlier aliases win, so "Quantity" beats "Position" when both exist.
    for (const alias of ALIASES[field]) {
      const index = normalized.indexOf(alias);
      if (index >= 0) {
        columns[field] = index;
        break;
      }
    }
  }
  if (columns.ticker === undefined || columns.shares === undefined) return null;
  // IBKR activity statements: "Open Positions,Header,DataDiscriminator,..."
  if (normalized[1] === "header" && cells[0]) columns.section = cells[0];
  return columns;
}

function isTransactionHeader(cells: string[]): boolean {
  const normalized = cells.map(normHeader);
  return (
    normalized.some((name) => TRANSACTION_COLUMNS.has(name)) &&
    normalized.some((name) => ALIASES.ticker.includes(name))
  );
}

type HeaderHit = { index: number; columns: Columns };

function findHeader(records: CsvRecord[]): HeaderHit | null {
  let first: HeaderHit | null = null;
  for (let index = 0; index < records.length; index++) {
    const columns = matchColumns(records[index].cells);
    if (!columns) continue;
    const hit = { index, columns };
    if (columns.section && /^open positions$/i.test(columns.section)) return hit;
    if (!first) first = hit;
    if (!columns.section) return first;
  }
  return first;
}

/** Decides whether `1.234,56` style numbers are used (only for non-comma delimiters). */
function detectDecimalComma(records: CsvRecord[], delimiter: Delimiter): boolean {
  if (delimiter === ",") return false;
  for (const record of records) {
    for (const cell of record.cells) {
      const value = cell.replace(/[\s$€£]/g, "");
      if (/^-?\(?\d{1,3}(\.\d{3})+,\d+\)?$/.test(value) || /^-?\(?\d+,(\d{1,2}|\d{4,})\)?$/.test(value)) return true;
    }
  }
  return false;
}

/** "$1,234.56" → 1234.56, "(12.34)" → -12.34, "--" / "n/a" / "" → null. */
export function parseNumber(raw: string | undefined, decimalComma = false): number | null {
  if (raw == null) return null;
  let value = raw.trim();
  if (!value || /^(-+|n\/?a|na|none|null|—|–)$/i.test(value)) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value.replace(/\b(USD|EUR|GBP|CAD)\b/gi, "").replace(/[$€£\s '%*]/g, "");
  if (value.startsWith("-")) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith("+")) value = value.slice(1);
  if (value.endsWith("-")) {
    negative = !negative;
    value = value.slice(0, -1);
  }
  if (value.startsWith("$")) value = value.slice(1);
  if (decimalComma) value = value.replace(/\./g, "").replace(",", ".");
  else value = value.replace(/,/g, "");
  if (!/^\d*\.?\d+(e[-+]?\d+)?$/i.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

function looksLikeOption(raw: string, secType: string): boolean {
  if (/option/i.test(secType)) return true;
  const value = raw.trim().toUpperCase();
  if (/\b(CALL|PUT)\b/.test(value)) return true;
  if (/^-[A-Z]/.test(value)) return true; // Fidelity: -AAPL240119C150
  if (/^[A-Z]{1,6}\s*\d{6}[CP]\d/.test(value)) return true; // OCC: AAPL  240119C00150000
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value) && /\s[CP]$/.test(value)) return true; // Schwab: AAPL 01/19/2024 150.00 C
  return false;
}

/** Uppercases, drops `*` markers and exchange suffixes, and turns `BRK/B` / `BRK B` into `BRK.B`. */
export function cleanTicker(raw: string): string {
  let value = raw.replace(/\*/g, "").trim().toUpperCase().replace(/\s+/g, " ");
  const parts = value.split(" ");
  if (parts.length === 2 && EXCHANGES.test(parts[1])) value = parts[0];
  else if (parts.length === 2 && /^[A-Z]{1,5}$/.test(parts[0]) && /^[A-Z]$/.test(parts[1])) value = `${parts[0]}.${parts[1]}`;
  return value.replace(/^([A-Z]{1,5})\/([A-Z]{1,2})$/, "$1.$2");
}

function isValidTicker(ticker: string): boolean {
  return /^[A-Z0-9]{1,6}([.-][A-Z0-9]{1,3})?$/.test(ticker) && /[A-Z]/.test(ticker);
}

function detectBroker(header: string[], context: string): string | null {
  const names = new Set(header.map(normHeader));
  const has = (...keys: string[]) => keys.every((key) => names.has(key));
  if (header[1] && normHeader(header[1]) === "header") return "Interactive Brokers";
  if (has("financialinstrument") || has("costbasisprice") || has("costbasismoney") || has("costprice", "mult"))
    return "Interactive Brokers";
  if (has("averagecostbasis", "costbasistotal") || has("accountname", "costbasistotal")) return "Fidelity";
  if (has("reinvestdividends") || has("securitytype", "costbasis", "marketvalue")) return "Charles Schwab";
  if (has("investmentname", "shareprice")) return "Vanguard";
  if (has("pricepaid", "daysgain")) return "E*TRADE";
  if (has("averagecost", "equity") || has("averagecost", "totalreturn")) return "Robinhood";
  if (/interactive brokers|\bibkr\b/i.test(context)) return "Interactive Brokers";
  if (/fidelity/i.test(context)) return "Fidelity";
  if (/schwab|positions for (account|all-accounts)/i.test(context)) return "Charles Schwab";
  if (/vanguard/i.test(context)) return "Vanguard";
  if (/e\s?\*\s?trade|etrade/i.test(context)) return "E*TRADE";
  if (/robinhood/i.test(context)) return "Robinhood";
  if (/webull/i.test(context)) return "Webull";
  return null;
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

type Lot = { ticker: string; shares: number; cost: number | null };

export function parseBrokerCsv(input: string): BrokerCsvResult {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  let best: { delimiter: Delimiter; records: CsvRecord[]; header: HeaderHit } | null = null;
  for (const delimiter of [",", ";", "\t"] as Delimiter[]) {
    const records = tokenize(text, delimiter);
    const header = findHeader(records);
    if (!header) continue;
    const known = Object.keys(header.columns).length;
    const bestKnown = best ? Object.keys(best.header.columns).length : -1;
    if (known > bestKnown) best = { delimiter, records, header };
  }
  if (!best) {
    return { rows: [], skipped: [{ line: 1, reason: SKIP_REASONS.noHeader }], broker: detectBroker([], text), cash: null };
  }

  const { delimiter, records } = best;
  let columns = best.header.columns;
  const headerCells = records[best.header.index].cells;
  const decimalComma = detectDecimalComma(records, delimiter);
  const num = (cells: string[], field: Field) => {
    const index = columns[field];
    return index === undefined ? null : parseNumber(cells[index], decimalComma);
  };
  const str = (cells: string[], field: Field) => {
    const index = columns[field];
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };

  const contextLines = records.slice(0, best.header.index).map((record) => record.cells.join(" "));
  const skipped: SkippedLine[] = [];
  const lots: Lot[] = [];
  let cash: number | null = null;

  for (let index = best.header.index + 1; index < records.length; index++) {
    const { line, cells } = records[index];
    const filled = cells.filter((cell) => cell !== "");
    if (filled.length === 0) continue;

    if (columns.section) {
      // IBKR: only "<section>,Data,Summary" rows of the chosen section are positions.
      if (cells[0] !== columns.section) {
        contextLines.push(cells.join(" "));
        continue;
      }
      if (/^header$/i.test(cells[1] ?? "")) {
        columns = matchColumns(cells) ?? columns; // a sub-table with its own columns
        continue;
      }
      if (!/^data$/i.test(cells[1] ?? "")) continue;
      const discriminator = str(cells, "discriminator");
      if (columns.discriminator !== undefined && discriminator && !/^summary$/i.test(discriminator)) continue;
    } else {
      const next = matchColumns(cells);
      if (next) {
        columns = next; // a repeated header (e.g. one table per account)
        continue;
      }
      if (isTransactionHeader(cells)) break; // a transactions table follows the positions
    }

    const rawTicker = str(cells, "ticker");
    const description = str(cells, "description");
    const secType = str(cells, "secType");
    const firstLabel = (columns.section ? rawTicker : filled[0]) ?? "";

    if (filled.length < 2) {
      contextLines.push(filled.join(" ")); // footer / disclaimer line
      continue;
    }

    const isCash =
      CASH_TICKERS.has(cleanTicker(rawTicker)) ||
      CASH_LABEL.test(rawTicker) ||
      (!rawTicker && CASH_LABEL.test(firstLabel)) ||
      /cash|money market/i.test(secType) ||
      (CASH_DESCRIPTION.test(description) && /XX$/.test(cleanTicker(rawTicker)));
    if (isCash) {
      const amount = num(cells, "value") ?? num(cells, "shares") ?? num(cells, "totalCost");
      if (amount !== null) cash = round((cash ?? 0) + amount, 2);
      continue;
    }

    if (TOTAL_LABEL.test(rawTicker) || (!rawTicker && TOTAL_LABEL.test(firstLabel))) continue;
    if (!rawTicker) {
      contextLines.push(filled.join(" "));
      continue;
    }

    if (looksLikeOption(rawTicker, secType)) {
      skipped.push({ line, reason: SKIP_REASONS.option, symbol: rawTicker });
      continue;
    }
    if (secType && /forex|future|bond|crypto|warrant|cfd/i.test(secType)) {
      skipped.push({ line, reason: SKIP_REASONS.notStock, symbol: rawTicker });
      continue;
    }

    const ticker = cleanTicker(rawTicker);
    const shares = num(cells, "shares");
    if (!isValidTicker(ticker)) {
      // Long free text with no quantity is a footer note, not a holding.
      if (shares === null && rawTicker.includes(" ")) contextLines.push(filled.join(" "));
      else skipped.push({ line, reason: SKIP_REASONS.invalidTicker, symbol: rawTicker });
      continue;
    }
    if (shares === null) {
      skipped.push({ line, reason: SKIP_REASONS.missingShares, symbol: ticker });
      continue;
    }
    if (shares <= 0) {
      skipped.push({ line, reason: SKIP_REASONS.nonPositive, symbol: ticker });
      continue;
    }

    let cost = num(cells, "avgCost");
    if (cost === null) {
      const total = num(cells, "totalCost");
      if (total !== null) cost = total / shares;
    }
    if (cost !== null && !(cost > 0)) cost = null;
    lots.push({ ticker, shares, cost });
  }

  // Same ticker in several accounts: sum shares, share-weighted average cost (over lots with a cost).
  const merged = new Map<string, { shares: number; costShares: number; costTotal: number }>();
  for (const lot of lots) {
    const entry = merged.get(lot.ticker) ?? { shares: 0, costShares: 0, costTotal: 0 };
    entry.shares += lot.shares;
    if (lot.cost !== null) {
      entry.costShares += lot.shares;
      entry.costTotal += lot.cost * lot.shares;
    }
    merged.set(lot.ticker, entry);
  }
  const rows: ImportedHolding[] = [...merged].map(([ticker, entry]) => ({
    ticker,
    shares: round(entry.shares, 8),
    purchase_price: entry.costShares > 0 ? round(entry.costTotal / entry.costShares, 6) : null,
  }));

  return { rows, skipped, broker: detectBroker(headerCells, contextLines.join("\n")), cash };
}
