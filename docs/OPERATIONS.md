# Operations

## Required configuration

- `SEC_USER_AGENT` must identify the application and include a contact email.
- `ADMIN_LOGIN_EMAIL` and `ADMIN_LOGIN_PASSWORD` identify the studio account. `ADIMIN_LOGIN_EMAIL` and `ADIMIN_LOGIN_PASSWORD` are accepted aliases.
- The persona review (Run test) uses the model set in Admin studio (`llm_model`,
  default `claude-opus-5-5`); its provider key must be set. `HEDGE_FUND_LLM_MODEL` is
  not used.
- `ANTHROPIC_API_KEY` serves the persona review on Claude models and the 300-wishes
  repeat check. `OPENAI_API_KEY` serves screenshot extraction (and the persona review
  on OpenAI models); `OPENAI_VISION_MODEL` selects the screenshot model.
- SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`,
  `SMTP_STARTTLS`) turn on report-reminder emails.

## Sign-up email confirmation

New accounts must confirm their email before they can sign in. The link in the email
opens `/auth/confirm` on the web app. On the hosted Supabase project, turn on
Authentication -> Providers -> Email -> "Confirm email", set the Site URL, add
`<web origin>/auth/confirm` to the redirect URLs, and set up custom SMTP under
Authentication -> SMTP Settings (Supabase's built-in sender is heavily rate-limited and
only delivers to project team members). Admin access also requires the admin email to
be confirmed.

## Password reset and legal pages

The reset email links to `/auth/reset`; add `<web origin>/auth/reset` to the hosted
project's redirect URLs next to `/auth/confirm`. Set `NEXT_PUBLIC_CONTACT_EMAIL` to the
address shown on `/terms` and `/privacy`, and have both pages reviewed before a wider
launch.

## AI usage limits

Daily per-person limits for the wish check, screenshot import, and AI review are set in
Admin -> Studio settings and counted in `ai_usage` (UTC days).

## Admin -> Connections

The Anthropic and OpenAI keys, the screenshot model, the SMTP settings, and the SEC
contact can also be set in Admin -> Connections, where each service has a live Test.
Values saved there override the server config, apply without a restart, and are
encrypted in `app_connections` (only the service role can read it). The encryption key
is `CONNECTIONS_ENCRYPTION_KEY` when set, otherwise one derived from
`SUPABASE_SERVICE_ROLE_KEY`; if that key changes, saved values can't be read and must be
entered again. Saved secrets are never returned, only their last four characters.
- `SUPABASE_SERVICE_ROLE_KEY` is used only by the API. Never expose it through a
  `NEXT_PUBLIC_` variable.

## Data behavior

- EDGAR filings are filtered by filing date, not fiscal period end.
- SEC requests are identified, throttled below ten requests per second, and cached.
- Keyless Yahoo Finance completed daily closes enrich market cap and P/E without using
  a future price. This best-effort public response is not treated as a real-time or
  exchange-grade quote.
- Quote metadata supplies instrument type and quote currency. When it differs from the
  portfolio base currency, a completed Yahoo FX close is applied and its rate remains
  visible through the position details. A missing conversion produces partial-data
  status rather than mixing currencies.
- Company-name entries are normalized through the SEC company-ticker directory, with
  Yahoo symbol search as a fallback for brand names SEC does not list. The displayed
  company name and industry come from SEC submissions.
- A ticker with fewer than four TTM periods causes persona abstentions.
- Network, authentication, parsing, and provider failures fail the run visibly.
- A held ticker without a recent close fails valuation rather than silently becoming cash.
- Portfolio screenshots must be PNG, JPEG, or WebP and at most 8 MB. They are sent to
  OpenAI for extraction but are not stored; users confirm a preview before positions
  are merged. CSV imports support column mapping, per-row errors, and duplicate choices.
- Analytics uses current saved quantities, cost basis, cash, and timestamped prices.
  Historical charts and history-dependent risk metrics remain unavailable until dated
  snapshots, transactions, and cash flows exist. ETF look-through remains unavailable
  until verified constituent weights exist.

## Decision behavior

- The five personas use the same snapshot and the same configured LLM.
- Each persona is identified by its own vector icon in the studio. Editing a system
  prompt and selecting `Save studio` persists that prompt for subsequent reviews.
- Invalid JSON and failed LLM calls abstain and do not vote.
- Both sleeves are long-only; bearish votes can reduce a target to zero but cannot short.
- Recommendations use post-risk `final_weights`.
- The studio defaults to a 25% name cap, a 25% industry cap, a 70/30 deep-value and
  trajectory split, transaction-history analytics enabled, and the built-in persona
  prompts. The industry catalog starts
  filled with twelve named, vector-icon-labeled sectors used by the portfolio
  dropdown; admins can add, rename, or remove entries. Industry icons are assigned
  automatically from their names and remain unique while unused icons are available.
  A saved cap or sleeve weight replaces those defaults on the next review. The 100%
  gross cap still leaves removed weight in cash.
- Generated share deltas are displayed only. No broker integration exists.

## Local database

Run `npx supabase start`, then `npx supabase test db`. All exposed tables have RLS.
Authenticated users can manage only their own portfolios and can read only their own
analysis records. They cannot read or write studio settings or persona prompts. Analysis
and studio writes use the server-only service-role key after API ownership or admin checks.

Apply `20261024010803_portfolio_workspace_redesign.sql` before
`20261024013000_portfolio_analytics_support.sql`. The latter is additive and creates
user-owned risk-limit, review-cache, and verified-event tables. If local Supabase is
unavailable, apply both files in timestamp order through the hosted SQL editor and then
run the database policy tests in a working local Supabase environment.

The portfolio redesign migration keeps existing snapshots valid with USD/SPY defaults,
adds portfolio settings and security classifications, and replaces multi-request
updates with one authenticated atomic RPC. Run a clean `supabase db reset --local`
before deployment so migration replay is verified, then compare local and remote
migration histories after pushing.

## Report reminders

- Email delivery needs `SMTP_HOST` and `SMTP_FROM`; `SMTP_PORT` (default 587),
  `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_STARTTLS` (default true) are optional.
  Any SMTP provider works. Without them, reminders are still saved, the popup says
  email is not set up yet, and nothing is sent.
- When email is configured, the API checks for due reminders every
  `REMINDER_POLL_SECONDS` (default 900) and sends each one once, marking it `sent` or
  `failed` with the error. Dates use the UTC calendar day, matching the database.
- The next-report date is an estimate (last SEC filing plus 91 days). Companies set
  the real date; the popup and the email both say so.

## Recovery

Analysis runs are persisted as `pending`, `running`, `completed`, or `failed`. The MVP uses
an in-process background task. A process restart can leave a run in `running`; mark it
failed and retry. A durable external worker is a later production-hardening step.
