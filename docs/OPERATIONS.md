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

## Languages (English / Armenian)

Text is written in English in the code and wrapped in `t("…")` (`useT()` in client
components, `await getT()` in server ones). The English sentence is the key; Armenian
lives in `apps/web/src/lib/i18n/hy/<area>.ts`, and anything missing shows in English.
Use `{name}` placeholders for values and translate whole sentences. Keep wording in line
with `apps/web/src/lib/i18n/GLOSSARY.md`, and put words shared by several areas in
`hy/common.ts`. A native speaker should review the Armenian, especially Terms and Privacy.

## Branded emails

Every email shares one design, `apps/api/src/stockbuddy/emails.py`. The sign-in emails Supabase
sends are generated from it into `supabase/templates/`:

```
cd apps/api && uv run python scripts/build_auth_templates.py
```

Paste each file into **Supabase Dashboard → Authentication → Emails** (open the template, set
the subject, paste the file's whole content into the message body, save):

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | `confirmation.html` | Confirm your email for MyPortfolioBuddy |
| Reset password | `recovery.html` | Reset your MyPortfolioBuddy password |
| Change email address | `email_change.html` | Confirm your new email for MyPortfolioBuddy |
| Magic link | `magic_link.html` | Your MyPortfolioBuddy sign-in link |
| Reauthentication | `reauthentication.html` | Your MyPortfolioBuddy security code |
| Security: password changed (turn on) | `password_changed_notification.html` | Your MyPortfolioBuddy password was changed |
| Security: email changed (turn on) | `email_changed_notification.html` | Your MyPortfolioBuddy email was changed |

Links use `token_hash`, so they work in any browser, and point at `/auth/confirm` and
`/auth/reset`, which must be in the Redirect URLs. The sender name and address come from
custom SMTP (**Authentication → Emails → SMTP Settings**); without it Supabase sends from
"Supabase Auth" and only a few emails an hour.

The API sends three emails itself, through the email settings in **Admin → Connections →
Email** (skipped when those are not set; a failure never undoes the action): a **welcome**
guide right after the address is confirmed, a **link shared** note with the link when someone
turns on a share link, and a **goodbye** after an account is deleted.

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

## Hosting (Vercel + Supabase)

One Vercel project (`stock-buddy-ai`) runs both parts as Vercel Services, configured in
the root `vercel.json`: the website (`apps/web`, Next.js) and the API (`apps/api`,
FastAPI, loaded from `apps/api/index.py`). Requests to `/api/...` and `/health` go to the
API, everything else to the website, all on the same address. In the project settings,
Root Directory is `./` and Framework Preset is Services.

- **Variables** (one list for the whole project): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CONTACT_EMAIL`, and
  `NEXT_PUBLIC_API_URL` = the site's own address; for the API `WEB_ORIGIN` = the same
  address, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the same
  one as before, or keys saved in Admin -> Connections can't be decrypted),
  `SEC_USER_AGENT` (must contain an email or the API won't start), `ADMIN_LOGIN_EMAIL`,
  `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`, and `CRON_SECRET`. Only `NEXT_PUBLIC_` ones
  reach the browser; they are baked in at build time, so redeploy after changing them.
- **Install:** Vercel installs the API from `pyproject.toml` + `uv.lock` with uv, and a
  review may run up to 300 s.
- **How Vercel changes behaviour** (`VERCEL=1` turns on `serverless`): nothing runs after
  a response, so an Ask Buddy review runs inside its request and answers when finished
  (the page shows "Reviewing…" meanwhile); report reminders are sent by Vercel Cron
  calling `/api/cron/reminders` daily at 14:00 UTC with `CRON_SECRET`, not by a timer; the
  SEC and engine caches live in `/tmp`, which is cleared between instances.
- **Size:** the review library's charting, terminal, and unused AI-provider packages are
  skipped with `[tool.uv] override-dependencies`; a production install is about 180 MB
  (Vercel's Python limit is 500 MB).
- **Supabase Auth -> URL Configuration:** Site URL is the web address; Redirect URLs
  include its `/auth/confirm` and `/auth/reset` (add the localhost ones to test locally).

## Recovery

Analysis runs are persisted as `pending`, `running`, `completed`, or `failed`. The MVP uses
an in-process background task. A process restart can leave a run in `running`; mark it
failed and retry. A durable external worker is a later production-hardening step.
