# StockBuddyAI Architecture

## Status

The first vertical-slice web MVP is implemented. It supports Supabase authentication,
portfolio import, one-held-ticker analysis, persisted jobs, and an auditable recommendation.

## Product Scope

StockBuddyAI is a study tool for long holders. It reads public SEC filings, adds
public Yahoo Finance daily closes, calls the five existing LLM personas, applies long-only
portfolio construction and risk limits, and compares the target with actual shares.
It never sends an order to a broker.

After authentication the app opens on `FIRE`. The sidebar menu shows `FIRE` first, then `Portfolio` with its
tools `Analytics`, `Transactions`, and `Run test` indented beneath it, then a disabled
`Settings` placeholder (marked Soon), and `Admin` for the admin account. The configured admin email also gets an Admin studio
for persona prompts and shared book settings.

`Portfolio` is the default, full-width holdings editor; `Transactions` and
`Analytics` are sibling views of the same selected portfolio. Analytics is a fault-isolated
portfolio-performance, allocation, concentration, and risk dashboard. It uses current
portfolio data when calculations are supportable and displays explicit unavailable
states for history-dependent metrics rather than estimating portfolio history.

## Code Structure

- `.cursor/rules/` — persistent project development rules.
- `apps/web/` — Next.js 16 interface, Supabase SSR authentication, the user book, and the admin studio.
- `apps/web/src/lib/workspace.ts` — browser-safe workspace types and fallback book
  settings shared by Server and Client Components.
- `apps/web/src/lib/server-api.ts` — server-only authenticated API access backed by
  the cookie-based Supabase server client.
- `apps/web/src/lib/analytics.ts` — pure typed calculations for current value, cost
  basis, gain/loss, weights, concentration, allocations, contributors, and risk limits.
- `apps/web/src/components/analytics/` — accessible analytics controls and modules;
  each module owns its loading, unavailable, or error presentation.
- `apps/api/` — FastAPI orchestration, EDGAR adapter, engine integration, and tests.
- `apps/api/mandates/long-book.yaml` — versioned 70/30 long-only mandate.
- `supabase/migrations/` — reproducible schema, grants, functions, and RLS.
- `supabase/tests/` — database policy tests.
- `docs/` — architecture, data-flow, and technical decision documentation.
- `CHANGELOG.md` — chronological record of completed changes and functionality.

## Architecture Decisions

### ADR-001: Documentation and verification are mandatory

- Every implementation must update this document when structure, data flow, database design, or responsibilities change.
- Every completed change must be recorded in `CHANGELOG.md`.
- Relevant tests and checks must pass before work is reported as complete.

### ADR-002: Keep the investment engine separate

StockBuddyAI pins `aihf` commit `4e1657ddc689e3939c481a8f0955444b10f02dc9`
as a Python dependency. The app calls its snapshots, personas, blending, limits,
validation, and order-sizing functions instead of reimplementing those rules.

### ADR-003: Split the web and analysis runtimes

Next.js owns the browser experience and Supabase cookie session. FastAPI validates the
Supabase token, checks portfolio ownership, and runs the synchronous Python engine in a
background thread. Run status is persisted so the browser can poll without keeping the
analysis request open.

### ADR-004: Fundamentals and prices remain separate

`EdgarClient` supplies filing-date metadata, company/ticker resolution, sector metadata,
and computed TTM fundamentals. The composite data client uses Yahoo Finance's keyless
public chart response for completed daily US equity closes. Every historical valuation
uses a close available on or before the relevant filing date. This best-effort source
does not promise real-time, intraday, or exchange-grade quotes.

### ADR-005: Portfolio imports are reviewed before persistence

The portfolio workspace exposes separate position, CSV, and screenshot actions. CSV
files support column mapping and both import paths produce a confirmation preview with
row errors and duplicate choices. Screenshots are sent directly to OpenAI for
structured ticker/share extraction and are not stored. Imports merge only after the
user explicitly confirms; weighted average cost is used when duplicates are combined.

### ADR-006: Resolve holdings to canonical public-company identities

The portfolio editor accepts either a ticker or company name. An authenticated API
lookup matches it against the SEC company-ticker directory; when SEC has no name match
(brand names such as "Google" for Alphabet Inc.), Yahoo's public symbol search supplies
the listed symbol, which is then matched back to SEC. A name that resolves nowhere is
reported as not found rather than as a price failure. The lookup replaces the entry with
the canonical symbol, and enriches the workspace with company name, completed closes,
day/period returns, quote timestamp/currency, SEC industry, asset classification, and
evidence-based lifecycle phase, and P/E (latest completed close divided by trailing
twelve-month diluted EPS from SEC filings; blank when EPS is missing or not positive,
N/A for funds). Yahoo FX closes convert non-base-currency holdings.
Valid ETFs missing from the SEC directory fall back to quote metadata. Funds and indexes
use `Not Applicable` as sector and lifecycle instead of masquerading as sectors.

Styles are compiled by Tailwind v4's PostCSS plugin (`apps/web/postcss.config.mjs`),
the setup Next.js 16 documents; an earlier custom Turbopack CSS loader served stale
stylesheets after edits and was removed.

The web UI follows the BazarCRM design system: design tokens (colors, borders, row
tones, sidebar colors) live as CSS variables at the top of
`apps/web/src/app/globals.css`, the font is Inter, and `AppHeader` renders a fixed
dark left sidebar (brand, account, main navigation, sign out) that collapses into a
top bar below 900px. Analytics, Transactions, and Run test are indented under Portfolio
in the sidebar; Portfolio itself opens the holdings editor. Primary actions use the gold accent with navy text.

Holdings show in their saved order by default. A grip handle on each row reorders by
drag-and-drop or with the up and down arrow keys; Save changes persists the new
`display_order`. Column sorting only changes the view until the next drag. Summary cards
and portfolio settings each sit in one row when the window is wide enough and wrap
evenly when it is not. Clicking an operating company's report date opens a reminder
popup that estimates the next quarterly report (last SEC filing plus 91 days, shown as
an estimate) and schedules an email to the signed-in user. Analytics groups fund
sectors and industries under `ETF/Index`.

Typography uses one scale defined as `--text-*` tokens in `globals.css`: 14px body
text, 12px minimum for any text, and 13px sentence-case labels without letter-spacing
or all-caps. All-caps is reserved for short badges (buy/sell, review verdicts) and
ticker symbols. Interface labels, buttons, and headings use sentence case; stored data
values such as sector names keep their own capitalization.

The portfolio workspace gives the holdings editor the full available width and moves
analytics into a dedicated sibling tab. Its compact primary table exposes quantity and
purchase price as the only editable financial cells; current price, market value,
cash-inclusive weight, unrealized gain/loss, 1-month, 6-month, and 1-year price
returns, day change, lifecycle, and explained status are calculated. Each row's left
bar is green for a positive unrealized gain and red for a negative one. Expanding a
holding shows one short row with editable Asset type and Sector and the read-only
Industry; investment category, notes, lifecycle evidence, and quote provenance stay
on the saved position. Users can independently hide or show the return,
lifecycle, and StockBuddy status columns; lifecycle and StockBuddy status start hidden,
and the remaining columns expand to fill the row. Desktop uses the full table with a
dedicated Actions track wide enough to keep its control inside the right edge. Tablet
hides secondary columns, and mobile uses card-like rows. Sorting never mutates
saved position order. Each holding menu offers Analyze Position, Add Transaction,
and Remove Position, and dismisses on an outside pointer action or
Escape. A dedicated Transactions sibling tab reads persisted buys and sells for the
selected portfolio and displays their date, symbol, quantity, price, and total.
The analytics area contains compact summary metrics grouped into eight cards across
two desktop rows, including a combined holdings/risk-warning count, explained
risk-limit warnings, four simultaneous allocation data boxes arranged as Positions
beside Industries and Sectors beside Asset Types, Gains and Losses attribution,
and concentration analytics. Lifecycle, thesis-monitoring,
fundamental-health, and upcoming-event panels are intentionally omitted from this
workspace.
Its deterministic evidence-based review is a compact, expandable overview at the top
of the performance module. On desktop, the controls and Risk Limits panels share a
50/50 top row down to 800px; narrower screens stack them, and Performance uses the full
row below. Allocation boxes use compact rows, keep percentage and value on one line,
and suppress repeated position labels. Analytics panels
override the generic workspace panel minimum height so controls do not create empty
vertical space. The performance module shows an explanatory empty state until real
snapshots and cash flows exist. The responsive layout changes wide tables and
multi-column panels into stacked cards. Status text and icons accompany color, and
controls remain keyboard accessible.

### ADR-008: FIRE planning reuses Path2Wealth's model, not its data

The FIRE section rebuilds Path2Wealth's structure and logic inside StockBuddy rather
than linking to Path2Wealth's separate Supabase project. Entries are stored in
StockBuddy's own `fire_entries`; assumptions in `fire_settings`. The pure
`apps/web/src/lib/fire.ts` module expands repeating entries into dated occurrences
(same day each period, clamped to short months, stopping at an end date) and converts
them to monthly equivalents for the summary. `projectFromEntries` then projects month by
month with each asset at its own rate: stocks and portfolio cash compound at the expected
return; each bond compounds at its coupon rate and each savings account or CD at its APY
(interest reinvested in the same account) until it matures, when its value moves into
stocks. Each month's new money, income minus expenses without that interest (or the
user's fixed monthly-investing override), is added to stocks. Incomes and expenses are
assumed to rise with inflation; balances compound in dollars and are converted to today's
dollars by removing inflation. The FIRE number is yearly retirement
spending ÷ safe withdrawal rate (25× at 4%); above 4.5% the plan also reports the 4%
number and date. Current assets are the
selected portfolio's value including cash plus the balances of running savings
accounts, CDs, and bonds; the page charts them as Stocks (holdings), Bonds, Savings &
CDs, Cash, and Real estate. Display figures for the page (progress = current assets ÷
FIRE target, remaining = max(target − assets, 0), monthly/annual = monthly × 12,
foreign-currency views, income-by-source / expense-by-category breakdowns, and
`cashFlowByPeriod`, which buckets dated payments into Monday-start weeks or calendar
months for the timeline popup) live in
`apps/web/src/lib/fire-views.ts`. The projection chart stacks starting assets,
cumulative contributions, and growth (total − both) from `FirePlan.series` up to two
years past the FIRE month (10 years if already reached), marking the FIRE point. "What you own today" also shows
`fire_assets` market values grouped as Real estate, Vehicles & equipment, and Other
assets; they are excluded from FIRE assets because their rent is already income. The emergency fund counts only portfolio cash,
savings accounts, and CDs. The calendar adds holdings' last SEC report dates and
quarterly estimates (+3 months each, labelled "est."). Assumption fields without a
saved value show and follow the value calculated from the entries (marked Auto) (monthly investing = income − expenses; retirement spending =
12 × monthly expenses). Each entry keeps its own currency; the page fetches one rate
per foreign currency from the authenticated `GET /api/fx?from=&to=` endpoint (latest
completed Yahoo FX close) and converts amounts and principals to the base currency
before summing. Currencies without a rate are excluded from totals and named in a
notice rather than added at face value. All figures are estimates and never advice.

### ADR-007: Analytics never fabricates portfolio history

Current-value analytics use saved quantities, average cost, cash, and timestamped public
quotes. The account's actual total return, volatility, drawdown, beta, Sharpe ratio,
downside deviation, and correlations require dated holdings and cash-flow history; until
those exist they are reported as unavailable, never estimated.

Performance and benchmark comparison use a separate, explicitly labeled hypothetical:
today's share counts valued at real completed daily closes over the chosen range
(`GET /api/prices/history`, `apps/web/src/lib/performance.ts`), compared with the
benchmark's real return. Cash is left out, holdings without a close at the start of the
range or in another currency are excluded and named, and the chart and metrics say
"current holdings as if held" and that past buys, sells, and deposits are not included.
It is never presented as the account's history.

Allocation has separate position, asset-type, sector, and industry boxes. ETF, index,
and other fund-like holdings remain visible with current values in those boxes and
remain part of total portfolio value, but are excluded from position, concentration,
sector, asset-type, and speculative risk-limit calculations.

The StockBuddy Portfolio Review is a deterministic, versioned rules calculation and
does not call an LLM on render. Every warning includes its measured value, configured
limit, affected holdings, and explanation. The schema can cache future generated
reviews with engine/model, prompt, data-version, and input-fingerprint metadata.

Transaction history feeds Analytics only when the shared
`use_transaction_history_analytics` studio setting is on (the default) and the
recorded buys and sells reconcile exactly to every current position's shares. Then
cost basis comes from an average-cost ledger built from those transactions, and the
dashboard adds realized gain/loss and a transaction-based return that covers recorded
trades only (no dividends, fees, or external cash flows). Otherwise Analytics keeps the
saved snapshot purchase prices and explains why the transaction figures are unavailable.

## Data Flow

1. An authenticated user manually enters holdings, imports `ticker,shares`, or reviews
   screenshot-extracted rows, then enters portfolio cash and saves.
   Selecting an existing saved portfolio changes Save into Update; deleting a portfolio
   removes its positions and historical analysis records through database cascades.
   The newest saved portfolio opens automatically on page load. A create-new action
   below the saved list clears the editor and returns it to create mode.
   After persistence succeeds, the submit button provides an in-place Saved/Updated
   confirmation until the user changes the portfolio again.
2. Recording a buy or sell calls an authenticated database RPC that updates the current
   position snapshot and appends the transaction history in one database transaction.
3. The API creates a persisted analysis run after verifying ownership and holdings.
4. EDGAR facts become newest-first `FinancialMetrics`; dated prices add market cap and P/E.
5. The five personas receive the same `FundamentalsSnapshot`.
6. The engine blends each sleeve using the admin studio weights, nets those capital slices, and applies the admin position cap.
7. The app compares `final_weights` with current weights and calls `build_orders` for the
   displayed share delta.
8. Signals, reasons, decision payload, recommendation, and run status are saved in Supabase.

## Supabase Design

- `portfolios` and `portfolio_positions` store user-owned holdings, cash, benchmark,
  base currency, risk settings, optional purchase prices, display order, asset type,
  sector, industry, investment category, quote currency, lifecycle phase/evidence,
  latest SEC report date/source, and notes.
- `create_portfolio` and `update_portfolio` are authenticated atomic RPCs. Snapshot
  writes replace the current portfolio state.
- `portfolio_transactions` stores user-owned buy/sell history. The authenticated
  `apply_portfolio_transaction` RPC appends history and updates quantity and weighted
  average cost atomically; it does not create broker orders or claim tax-lot accounting.
  Existing position snapshots are not backfilled as transactions because their true
  trade dates and individual fills are unknown.
- `portfolio_risk_limits` stores additive concentration thresholds without changing
  existing portfolio records.
- `portfolio_review_cache` stores versioned review evidence and model metadata so a
  review need not be generated on every render.
- `fire_entries` stores a user's incomes and expenses: kind, category, name, amount per
  occurrence, currency, frequency (once, monthly, quarterly, semiannual, annual), start
  and optional end date, and for savings, CDs, and bonds the principal and yearly rate.
  Bonds also store `quantity` and `unit_price`; the API sets principal (face value) to
  their product. Rental income links to the asset that earns it through `asset_id`
  (a composite key with `user_id`, so it can only point at the owner's asset; deleting
  the asset unlinks the income).
- `share_links` holds read-only share links (a 43-character random token, kind `fire` or
  `portfolio`, and the portfolio). Owners manage their own rows under RLS; the public
  `GET /api/share/{token}` (`stockbuddy/sharing.py`) reads that one owner's data with the
  service role, prices holdings live, and caches the result for 5 minutes. The web page
  `/share/[token]` needs no sign-in and reuses the FIRE plan math and projection chart.
- `app_connections` stores values an admin saves in Admin -> Connections, encrypted by
  the API (`stockbuddy/connections.py`); RLS is on with no grants for signed-in users.
  On startup and after each save, `apply_connections` rebuilds the services that use
  outside connections (analysis, market data, reminders, wish matcher) from the merged
  settings and exports the AI provider keys for the persona-review library.
- `wishes` stores a user's wishes in three lists (`short`, `long`, `exercise`) with a
  generated `normalized` text and a unique index per list, so exact repeats are refused;
  a trigger caps the exercise at 300. `position` keeps the dragged order (new wishes go
  last); `reorder_wishes(list, ids)` saves a list's order in one call as the caller. Owner-only under RLS, written with the user's token.
  `POST /api/wishes/check` (`stockbuddy/wishes.py`) compares a new exercise wish with the
  existing ones: exact match first, then Claude (`claude-opus-5-5` via the Anthropic SDK,
  low effort, JSON schema output, server-side fallback on refusal), then word overlap
  when `ANTHROPIC_API_KEY` is missing or the call fails.
- `education_articles` stores admin-written articles (title, body, optional picture
  path, published flag, order). Signed-in users can read published rows under RLS; there
  are no write policies, so only the API writes them with the service role after the
  admin allowlist check (`/api/admin/education/*`). Pictures are uploaded through
  `/api/admin/education/images` (PNG, JPEG, WebP, or GIF, up to 5 MB) into the public
  `education` storage bucket under `articles/`; the API returns their public URL.
- `fire_assets` stores things a user owns outside the portfolio: rental type
  (residential, vacation, commercial, land, vehicle, equipment, other), name, optional
  market value, currency, and optional location (up to 200 characters). Adding rental income can create its asset in the same
  request (`new_asset`), or link an existing one (`asset_id`). The migration moved each
  older rental's property value from `principal` into a residential asset.
  `fire_settings` stores one row of projection assumptions per user. Both are owner-only
  under RLS and written through the API with the user's token.
- `user_profiles` stores one row per user with an optional `date_of_birth` (between
  1900 and today). Ages are never stored; `apps/web/src/lib/age.ts` derives the current
  age, FIRE age, and FIRE month. The profile opens from the sidebar account card.
- `report_reminders` stores a user's request to be emailed on a chosen date about a
  holding's next report. Users may insert, read, and delete only their own rows and may
  set only ticker, dates, company, and portfolio; the recipient defaults to the email in
  their session token and delivery status is server-owned. The API's reminder loop sends
  due rows by SMTP using the service-role key and marks them sent or failed.
- `portfolio_events` stores only verified or user-entered portfolio dates with source
  and verification timestamps.
- `analysis_runs` stores lifecycle state and the complete engine decision JSON.
- `analysis_signals` stores each persona's normalized vote and reasoning.
- `recommendations` stores current/target weights, label, close, and share delta.
- `app_settings` stores the shared position cap, industry-position cap, deep-value and trajectory sleeve weights, model id, and the `use_transaction_history_analytics` flag (default `true`) exposed to signed-in users through `/api/settings`.
- `industries` stores the reusable sector names, icons, and display order. The studio
  seeds Communication Services through Utilities, plus Other; the portfolio editor
  loads this catalog into its sector dropdown. Icons are stored as Lucide icon names,
  while admins can add, rename, or remove catalog entries. The client previews and the
  API authoritatively assigns an icon from each industry name, preferring semantic
  keyword matches and avoiding icons already used elsewhere in the catalog.
- `persona_prompts` stores the editable system prompt for Graham, Buffett, Munger,
  Lynch, and Druckenmiller. The Admin studio sends every edited prompt with
  `Save studio`; each persona card has a distinct Lucide icon derived from its stable id.
- Both studio tables enable RLS and revoke access from `anon` and `authenticated`. The API reads and writes them with the service-role key.
- Admin access is the server-side `ADMIN_LOGIN_EMAIL` allowlist, with `ADIMIN_LOGIN_EMAIL` accepted as the same setting. The API never treats user-editable metadata as an authorization source.
- Every exposed table has RLS and explicit least-privilege grants.
- Browser writes use the authenticated user's JWT. Analysis writes use a server-only
  service-role key after application-level ownership checks.
- The local schema is migration-driven and policy behavior is covered by pgTAP tests.

## Known MVP Boundary

Signed-in users work in the book: portfolio import, current-data analytics, and
one-holding reviews. The admin email opens the studio at `/admin`. Accurate historical
performance, fund look-through, advanced history-dependent risk, portfolio-wide
fundamental aggregation, and event feeds remain unavailable until their required
transaction, constituent, comparable filing, and verified calendar sources exist.
Broker execution remains outside the product.
