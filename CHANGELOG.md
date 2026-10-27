# Changelog

All notable project changes and user-visible functionality are recorded here.

## Unreleased

### Added

- Portfolio page: the Cash field shows the cash amount and share, the target and its dollar amount (for example "$0.00 / 0.0% · Target 5%: $4,980.17"), with an (i) explaining it.

- Admin studio: "Minimum cash %" in Limits and model (default 5%). Portfolios without their own Min cash use it as their cash target. Needs migration 20261027120000_min_cash_default.sql.

- Cash balance cards (Portfolio and analytics) now show cash as amount and share, the cash target (the portfolio's Min cash, or 5% when none is set), how much cash is missing, and an (i) explaining the target.

- Sign-in page: the two $100 notes slide in, then float and sway gently, out of step
  with each other (CSS only; still for people who turn on reduced motion).

- English / Armenian. US and ARM flag buttons at the top of the side menu (and the
  top-right of the sign-in, password, legal, and shared pages) switch the whole app; the
  choice is kept in a `lang` cookie for a year, so pages render in that language straight
  away. Without a choice, visitors in Armenia (Vercel's country header) or whose browser
  prefers Armenian start in Armenian; everyone else starts in English. The flag buttons
  scale with the space they get. Every screen, the built-in lessons, the legal pages, and the API's fixed messages
  are translated (~1,300 phrases). Admin-written articles, wishes, AI review text, and
  brand names stay as they are; untranslated text falls back to English. Noto Sans
  Armenian is loaded for Armenian letters. Translations live in `apps/web/src/lib/i18n/hy/`
  (one file per area) with a shared `GLOSSARY.md`.

- Profile: "Delete my account and data". Typing "delete" enables the button; the API
  (`DELETE /api/account`) checks the word again and deletes the sign-in, which removes all
  of that person's data through the database's cascades, then signs out to a notice. The
  admin account can't be deleted this way.
- Sign out asks "Sign out?" first (Stay signed in / Sign out).
- New-password page: a show/hide eye button for both fields.

- Branded sign-up confirmation and password-reset emails (`supabase/templates/`): green
  StockBuddy header, gold button, friendly wording, a plain link as fallback, and links
  that work in any browser (`token_hash`). Used locally via `supabase/config.toml`; paste
  into the hosted project as described in `docs/OPERATIONS.md`.

- The API runs on Vercel next to the website in the same project, as Vercel Services
  (root `vercel.json`: `/api/...` and `/health` go to `apps/api/index.py`, the rest to
  `apps/web`).
  On Vercel an Ask Buddy review finishes inside its request (the page shows "Reviewing…"
  until it answers), report reminders come from a daily Vercel Cron call to
  `/api/cron/reminders` checked with `CRON_SECRET`, and caches use `/tmp`. Unused
  packages from the review library (charts, its terminal app, Google/xAI/DeepSeek
  connectors) are skipped, bringing the install to about 180 MB. `cryptography` and
  `requests` are now listed as direct dependencies. Render setup removed. Steps in
  `docs/OPERATIONS.md`.

- Sign-in page: two drawn $100 "StockBuddy Reserve" play bills in the navy panel (an
  illustration with its own wording and emblem, not a copy of real currency), and
  "© 2026 AIAutomationLA.com. All rights reserved." under the Terms and Privacy links.

- Ask Buddy checks SEC filings before using a token. Holdings without 4 quarters of
  filed company financials (ETFs and funds, foreign or new listings) are marked "Can't
  review yet" with the reason in the Holdings list, unticked and locked, and named in a
  note above the button. The API refuses such a review with that reason before counting a
  token (`422`), and the queue skips it and carries on. New
  `GET /api/analyses/readiness?tickers=…&as_of=…`. A review where every persona lacked
  filed data shows one "Not enough company data" line instead of five abstain cards.

- Support us (menu, heart icon): why StockBuddy asks for help (no sponsors, no ads, data
  never sold) and a $9 a month subscription, shown as coming soon.
- Run test is now Ask Buddy (robot icon), with a subtitle that explains what it does:
  pick holdings for a second opinion; five personas review each one and Buddy sums it up.

- Admin → Studio: "Review model" is now a list of the models the persona review supports
  (Opus 5.5 and Fable 5.1 on Anthropic, GPT-6 Sol and GPT-6 Astra on OpenAI) and says
  which Connections key the chosen model uses. Saving re-checks the key on the next
  review.

- Admin → Connections: Payments (Stripe) with secret key, publishable key, and webhook
  signing secret (secrets encrypted like the other connections). Test checks the key
  shapes, that both keys are the same mode (test or live), and asks Stripe for the
  balance. Saving keys doesn't turn buying on yet.

- Admin → Daily AI limits: a "Reset today's tokens" button (Testing) that clears today's
  AI use for the signed-in admin's own account only, so Run test can be tried again.
  New admin-only `POST /api/admin/ai-usage/reset`.

- Run test: compact Portfolios and Holdings dropdowns with checkboxes (everything ticked
  by default); the Holdings dropdown lists Ticker, Company, and Portfolio, one row per
  ticker per portfolio, with Select all. One token card at the top of the panel (one Buy tokens button) shows today's free tokens (left of the
  daily allowance, used, a meter, and when they reset at midnight UTC), that 1 token =
  1 holding review, and what this run costs; the card turns red with a warning
  line when the free tokens are used up or the picked holdings need more than are left. Buy tokens previews token packs (Starter 25, Plus 100, Pro 300) marked
  Coming soon; buying isn't open yet and tokens are free during early access. Run stays
  available when the selection is over the tokens left: the first ones run until the
  limit, and the rest don't start (no tokens used). Reviews run one at a time under a progress bar with Pause/Resume and
  Stop (both take effect after the review in progress; holdings not started use no
  tokens), and each result opens to its full report. New `GET /api/ai-usage` returns
  today's used, limit, and left per AI feature.

- Profile ("Your profile"): a Name, and Shareable links for the FIRE plan and each
  portfolio. Switching a link on creates and copies it (copy icon to copy again);
  switching it off stops it at once. Anyone with a link sees a read-only page at
  `/share/<token>` without signing in: FIRE summary, projection chart, incomes,
  expenses, and assets, or portfolio totals and every holding with price, value, weight,
  and gain. Email and date of birth are never shown, pages are marked noindex, and data
  is cached for 5 minutes. Migration `20261026090000_profile_name_and_share_links.sql`.
- Education content: 13 short beginner articles on saving, budgeting, debt, credit, and
  investing, written in our own words from the topics of *Financial Freedom Faster*
  (Steve Chen), each with a cover picture and a "Try it in StockBuddy" step. Kept in
  `content/education/` (articles, cover generator, and a loader that adds them to
  Education as drafts).
- Password reset: "Forgot password?" on the sign-in form sends a reset link (the same
  answer whether or not the account exists); the link opens `/auth/reset` and then
  `/reset-password` to choose a new password.
- Terms of Use and Privacy Policy pages (`/terms`, `/privacy`), readable without signing
  in and linked from the login page. Sign-up now requires agreeing to them and to the
  "not financial advice" notice; the accepted version and time are saved on the account.
  The contact address comes from `NEXT_PUBLIC_CONTACT_EMAIL`.
- Daily AI limits per person, set in Admin -> Studio settings: wish repeat checks (100),
  screenshot imports (20), and AI reviews (10); 0 turns a feature off. Counts are kept in
  the database and can only be raised through `use_ai_feature`, so users can't reset
  them. Over the limit, screenshot import and Run test explain it, and the wish check
  falls back to word matching and says why. Migration `20261026080000_ai_usage_limits.sql`.
- Security headers: a Content-Security-Policy, frame blocking, nosniff, a referrer
  policy, a permissions policy, and HSTS in production on the web app; nosniff, frame
  blocking, no-referrer, and no-store on API responses.
- Sign-up email confirmation: new accounts get a confirmation email whose link opens
  `/auth/confirm`, which signs the person in (or, from another device, asks them to sign
  in). The form says where the link was sent and offers "Resend"; signing in before
  confirming explains what to do instead of showing a raw error. Local Supabase now
  requires confirmation (`enable_confirmations = true`; emails appear in Mailpit at
  http://127.0.0.1:54324).
- Admin -> Connections: one card per outside service (Claude/Anthropic, OpenAI, Email
  SMTP, SEC EDGAR, Yahoo market data, picture storage) with its status, where each value
  comes from (Admin, server config, default, or not set), and a live Test; "Test all"
  checks everything. Keys, the screenshot model, SMTP settings, and the SEC contact can
  be saved there, override `.env`, apply without a restart, and are stored encrypted.
  Saved secrets are never shown again, only their last four characters. Migration
  `20261026070000_app_connections.sql`.
- Wishlist: drag wishes by their grip to reorder any list (Short term, Long term, Want,
  and the 300 wishes, whose numbers follow the new order); the up and down arrow keys on
  the grip do the same. The order is saved in one call. Migration
  `20261026060000_wish_order.sql`.
- Wishlist: a "Want" list (anytime) beside Short term and Long term; the tab is now
  "My lists". Migration `20261026050000_wish_wants.sql`.
- Wishlist page (menu): Short term (within 1 year) and Long term (1–5 years) lists with
  done checkboxes, plus the "300 wishes" exercise with a numbered list, X / 300 progress,
  and a repeat check on every new or edited wish. Exact repeats (ignoring case, spacing,
  and punctuation) are refused by the database; reworded repeats are judged by Claude
  (`claude-opus-5-5`, low effort, structured JSON) and shown with their number and
  reason, and the person can add the wish anyway. Without a working `ANTHROPIC_API_KEY`
  the check falls back to word overlap and says so. Migration `20261026040000_wishes.sql`.
- Assets: an optional Location (address, city, or area). It shows in the Assets list and
  opens Google Maps in a new tab. Migration `20261026030000_fire_asset_location.sql`.
- Education is now a full-width article grid: square picture tiles with the title over
  a dark fade (admin articles first, then the built-in lessons and the book list), each
  opening a reader. The "Tips for you" section was removed.
- FIRE timeline popup: the current week or month (the first bar and its list row) is
  blue and labeled "This week" / "This month".

### Fixed

- New accounts no longer show $10,000 they never entered. The portfolio form started
  with a made-up $10,000 cash balance, which FIRE counted as "Current assets" before any
  portfolio existed and which was saved if the person created a portfolio without
  changing it. Cash now starts at $0.
- The $100 note picture on the live sign-in page showed as broken: Vercel's image
  resizer isn't available with Services, so the (already small) picture is served as is.
- The new-password box is centred, and its errors (e.g. "New password should be
  different from the old password.") are red like the others.
- A review that fails because the AI account (OpenAI or Anthropic) is out of credits now
  says so and names where to add credits, instead of "No persona could reach the AI
  service. Try again in a few minutes." The queue stops so no more tokens are used.
- Run test no longer fails with "assessment <date> requires incomplete data": the
  as-of close defaults to the latest final close (yesterday in New York), and the API
  uses that close for any newer date.
- A rejected or missing AI key no longer uses tokens (the message names the Studio
  review model and its provider, and says to fix that key or pick the other provider's
  model): Run test checks the key before
  counting a review and explains that an admin can fix it in Admin → Connections; a
  review in which no persona could reach the AI now fails with that reason instead of
  five raw "abstained" errors, and the queue stops instead of spending the rest.
- Run test reviews no longer fail with "get_prices() takes 4 positional arguments": the
  price client accepts the interval arguments the analysis library's cache passes.
- Phones: FIRE, Assets, Wishlist, and Transactions no longer overflow a 375px screen, and
  the top menu has its own full-width row that keeps the current page in view.
- Admin now also requires the admin email to be confirmed, so signing up with the admin's
  address can't reach Admin before its owner confirms it.
- Run test: the persona review never received its AI provider key, because `.env`
  values were not exported to the process environment the AI library reads. The API now
  exports the configured keys at startup and after changes in Admin -> Connections.
- API validation errors now show their message instead of "[object Object]".
- Reminder emails start sending as soon as email is configured, without a restart.
- Wishlist: ticking a wish failed with "Failed to fetch" because the API did not allow
  PATCH requests from the browser (CORS). PATCH is now allowed, ticking shows at once,
  and every wish can be edited in place.
- FIRE: the "No exchange rate is available" box no longer flashes while exchange rates
  load; it shows only when a rate really could not be found. Foreign amounts read
  "Converting…" while the rate loads.

### Changed

- Sign-in headline line spacing: a little more in English (1.04) and more in Armenian
  (1.22, with less letter squeeze), whose letters reach above and below English capitals.
- Sign-in page: a photo of a real $100 note (two, stacked) replaces the drawn play bill.
  It is front only, shown at no more than about 58% of a real note's size, and stored at
  low resolution (`apps/web/public/login/hundred-dollar-bill.webp`).
- US-dollar green (#1f4d32) for the side menu and the sign-in panel (with a lighter
  green glow), instead of slate grey and navy.
- Sign-in, sign-up, and password-reset problems (e.g. "Invalid login credentials") show
  in red as an alert; confirmations such as "We sent a link" stay grey.
- Ask Buddy tokens are a monthly allowance that resets on the 1st (UTC) instead of every
  day. The token card says "This month's free tokens" and shows the reset date, and
  `GET /api/ai-usage` adds `period` and `resets_on`. Admin's limit is now "Ask Buddy tokens per
  month"; wish checks and screenshot imports stay daily. Admin's reset button is now "Reset
  my tokens" (this month's review tokens and today's other uses). Migration
  `20261026100000_monthly_review_tokens`.
- Page subtitles are shorter and stay on one line.
- Admin → Education: write financial articles (title, text, and an uploaded picture),
  set their order, and publish or keep them as drafts. Published articles appear for
  every user as a grid of cards under "Financial articles" on the Education page, and
  open to read in full. Pictures are stored in a public `education` storage bucket and
  removed when replaced or when the article is deleted. Migration
  `20261026020000_education_articles.sql`.
- Menu: Assets, Education, and Shop items above Settings; Shop is marked Soon. Assets
  moved from the FIRE page to its own Assets page.
- Education page: "Tips for you" from your own portfolio and FIRE numbers (largest
  position, index funds, idle cash, savings rate, emergency fund, withdrawal rate),
  each linking to its lesson; eight FIRE and investing lessons that open in place; and
  reading, videos, and tools per lesson (Investopedia, Investor.gov, Khan Academy,
  CFPB, TreasuryDirect) plus four recommended books. Tips logic is in
  `apps/web/src/lib/education.ts`.
- FIRE Assets: a new Assets section lists rental property, land, vehicles, and equipment
  with their market value and the rent each one earns. Choosing Rental income asks for
  the rental type (Residential Property, Vacation / Short-Term Rental, Commercial
  Property, Land, Vehicle Rental, Equipment Rental, Other Rental Income) and creates its
  asset, or links an asset added in the Assets section. Assets show in "What you own
  today" (not counted as FIRE assets). Migration `20261026010000_fire_assets.sql` moves
  existing rental property values into assets.
- Portfolio page title with a "See analytics" button (top right) that opens Analytics.
- FIRE progress: a pencil next to Current age opens the date of birth popup. The
  popup ("Your age") no longer shows the email address.
- Analytics: removed the explanatory note under the performance chart.
- Analytics page title with jump links to Allocation, Gains / Losses, and Risk analysis.
- Analytics: the Portfolio vs. benchmark chart is now at the top of the page. The
  Portfolio and Benchmark pickers, Refresh, and the date range buttons (1M–All) are
  inside the chart box; the StockBuddy Portfolio Review summary was removed.
- Portfolio allocation: a "What's considered normal?" note with common diversification
  rules of thumb (one position, sector, asset mix, cash, speculative) beside your
  configured limits.
- Bar-chart buttons beside the Incomes and Expenses pie icons show when money comes in
  or goes out over the next 12 months or 12 weeks (Weeks | Months toggle): a bar per
  period plus each period's dated payments, from every entry's own dates and frequency,
  stopping at end dates and converting other currencies.
- FIRE progress: percentage of the FIRE target funded (current assets ÷ target), a
  progress bar, current assets of the target, and the remaining amount, plus current
  age, estimated FIRE age, and estimated FIRE date. Ages need a date of birth; without
  one only the FIRE date shows.
- Date of birth in a new profile (click your account card in the sidebar). Only the date
  is stored; ages are always calculated from it.
- Pie-chart buttons beside the Incomes and Expenses totals open "Monthly Income
  Breakdown" (by source, with the original currency) and "Monthly Expense Breakdown"
  (by category): a donut, each item's normalized amount and share, and the total. On
  phones they open as a bottom sheet.
- A Monthly | Annual toggle on the FIRE page. Annual values are normalized monthly × 12
  and apply to the income, expense, and left-over cards, list totals and rows, and both
  breakdowns.
- Non-USD incomes show the payment and cadence in their own currency, its value in
  dollars, the monthly (or yearly) share, and the exchange rate used, from live rates.

- FIRE entries can be in other currencies (for example AMD bonds). Each entry shows
  its own currency, and totals, assets, and the FIRE projection convert it to the
  portfolio's base currency with the latest completed Yahoo exchange rate. Entries
  without an available rate are listed in a notice and left out of the totals. The
  add/edit form has a Currency picker.
- FIRE section (sidebar item FIRE), modeled on Path2Wealth's structure and logic and
  stored in StockBuddy's own database:
  - Incomes: salary, rental income, savings accounts and CDs (balance and APY), bonds
    (face value, coupon and maturity), dividends, bonus, freelance, and other, each with
    how often it is paid, its first date, and an optional end date. Interest and
    coupons are calculated from the balance and rate.
  - Expenses in Path2Wealth's categories (rent, bills, food, transport, insurance,
    health, taxes, travel, and more), one-time or repeating, with when they are due.
  - Summary cards for monthly income, expenses, money left over, savings rate,
    current assets (portfolio plus savings, CDs and bonds), FIRE number, and time to
    FIRE.
  - Path to FIRE: expected return, monthly investing, retirement spending, and safe
    withdrawal rate (blank fields use your entries), a growth chart, and short notes on
    the FIRE date, emergency fund, and biggest bottleneck.
  - A month calendar showing incomes, expenses, and holdings' last and estimated report
    dates, with monthly in/out totals and a per-day list.

### Changed

- "What you own today" shows how each asset grows under its name: bonds with their
  average coupon and savings & CDs with their average APY (both weighted by balance),
  stocks with the expected return, cash as growing with stocks, and real estate as not
  in FIRE assets.
- The Path to FIRE chart continues two years past the FIRE date. The FIRE point is marked
  with its value and a dashed line down to its date, the end of the line shows its value,
  the legend breaks down assets at the FIRE date, and the FIRE target label moved to the
  left so the rising line does not cover it.
- The FIRE projection now grows each asset at its own rate: stocks and portfolio cash at
  the expected yearly return, each bond at its coupon %, and each savings account or CD
  at its APY, with interest reinvested in the same account until a bond or CD matures and
  moves into stocks. Previously all interest was reinvested at the stock return.
- Fixed the FIRE projection ignoring savings, CD, and bond interest whenever Invest each
  month was typed in (for example 0). Interest is now always reinvested and shown as
  estimated growth rather than as a new contribution; Invest each month covers only new
  money, and its Auto value is income − expenses excluding that interest.
- The "You're there" FIRE note uses your withdrawal rate instead of a fixed 4%.
- When the FIRE target is already reached, the Path to FIRE chart shows the next 10 years
  instead of a flat single year.
- Removed the explanatory note under the Path to FIRE chart.
- FIRE number fields drop leading zeros as you type ("03" becomes "3"), in the
  assumptions and in the add/edit income and expense popup.
- FIRE progress now sits under Path to FIRE, and the ⓘ buttons sit to the right of the
  FIRE plan and Path to FIRE titles.
- The Path to FIRE chart now runs from today to the estimated FIRE date and separates
  starting assets, new contributions, and estimated investment growth, with the FIRE
  target line. It uses the existing month-by-month projection, so entries stop at their
  end dates.
- Moved FIRE to the top of the sidebar menu, above Portfolio, and made it the page
  that opens after sign-in.
- Analytics now shows the benchmark's real return over the chosen range and a
  performance chart (value, percentage return, or difference from the benchmark) for
  your current holdings as if held for the whole period, using completed daily closes.
  It is labeled as hypothetical and excludes cash and past buys and sells. Transaction
  return explains what to record to unlock it.
- Rebuilt the Transactions page: a Record transaction button (buy or sell, symbol,
  quantity, price per share filled from the latest close, and date), totals for bought,
  sold, and net invested, All/Buys/Sells filters, symbol search, company names, signed
  totals, and an empty state with a first-transaction button. Selling more than you hold
  or recording a future date is explained in the dialog.
- Today's date in the FIRE calendar now has a blue border and a blue day number.
- The FIRE projection is now built month by month from your entries instead of assuming
  today's cash flow forever: expenses and incomes start and stop on their own dates
  (for example a payment plan ending), bond coupons land in the months they are paid and
  stop at maturity, and the bond's principal is then reinvested.
- Added an Inflation assumption (default 3%). The chart, FIRE number, and assets are in
  today's dollars; stocks and cash grow at the expected return minus inflation, and fixed
  bond and CD payments lose value with inflation.
- Savings accounts, CDs, and bonds no longer grow at the portfolio's expected return in
  addition to paying interest; they are held at their balance and pay their own interest,
  removing a double count.
- Withdrawal rates above 4.5% show a warning under the field and a note with the FIRE
  number and date at the usual 4%.
- Loading FIRE settings no longer fails when the database is missing a newer setting
  column; missing values use their defaults.
- The Path to FIRE chart, summary cards, and notes now update as soon as an assumption
  is typed, before it is saved. A note under Save assumptions marks unsaved numbers, and
  an out-of-range value being typed (such as a 0% withdrawal rate) keeps the last valid one.
- Added an ⓘ button to the left of the FIRE plan and Path to FIRE titles; both open the
  same explanation. The "What is FIRE?" popup
  explains financial independence and how monthly totals, current assets, the FIRE
  number, time to FIRE, savings rate, and the emergency fund are calculated, using the
  user's own figures, plus what the estimate leaves out.
- Bonds are entered as Quantity and Price per bond; face value is calculated as their
  product and shown in the list (for example 221 × AMD 100,000 = AMD 22,100,000).
  Bonds saved earlier keep their face value until quantity and price are filled in.
- Rental income can record the property's market value. It appears as Real estate in
  "What you own today" but is not added to FIRE assets, because the rent is already
  counted as income.
- The emergency-fund note now counts only money you can reach quickly (portfolio cash,
  savings accounts, and CDs; bonds are excluded) and is colored green when it covers 5
  or more months of expenses, amber for 3–5 months, and red below 3, with the amount
  still needed.
- Path to FIRE shows a "What you own today" donut chart beside the growth chart:
  Stocks (portfolio holdings), Bonds (face value), Savings & CDs, and Cash (portfolio
  cash), each with its dollar amount and share, converted to the base currency.
- Shortened the Auto notes under the assumptions to "Current expenses × 12" and
  "Income − expenses".
- Path to FIRE now fills Yearly spending in retirement with your current expenses
  (monthly expenses × 12) and Invest each month with income minus expenses, shown as
  real values marked Auto. They keep following your entries until you type your own
  number; a link under the field switches back to the automatic value.
- The Path to FIRE chart now has time and value axes: a gridline for each year labelled
  with years from today and the calendar year, dollar gridlines on the left, and a red
  dashed line down from the FIRE point to the time and month you reach it (for example
  "7 yrs 3 mo · Jan 2034").
- Fixed style changes not showing up in the running app (for example, the FIRE
  heading spacing). Tailwind now runs through its official PostCSS plugin
  (`@tailwindcss/postcss`, `postcss.config.mjs`) instead of a custom Turbopack loader
  that kept serving an older stylesheet after edits and restarts.
- Fixed FIRE entries silently not saving. The add/edit popup now checks its own fields
  and shows any problem inside the popup, including a maturity or end date earlier
  than the first date (previously the browser blocked the save with no visible
  message). Server errors also appear inside the popup instead of behind it.
- FIRE Incomes and Expenses headings now show how many sources each list has and its
  monthly total. Every repeating entry counts as a monthly amount whatever its payment
  cycle (a semiannual bond coupon adds one sixth per month), converted to the base
  currency; one-time and finished entries are left out.
- Reorganized the sidebar: Portfolio, with Analytics, Transactions, and Run test indented
  under it; then FIRE; then a greyed-out Settings item marked Soon (not yet available);
  and Admin for the admin account. Portfolio stays highlighted while one of its tools is
  open, and the current page is announced to screen readers.
- Adding a position by brand name now works when SEC lists the company under another
  name: "Google" resolves to GOOG (Alphabet Inc.) through Yahoo symbol search. A name
  that matches nothing now says "No company or ticker matched" instead of a price error.
- Restored drag-and-drop row ordering in the holdings table: drag a row by its grip
  handle (or focus the handle and press the up/down arrow keys), then Save changes.
  Saved portfolios now open in their saved order instead of alphabetically.
- Added a P/E column: latest close divided by trailing 12-month EPS from SEC filings,
  blank when earnings are missing or negative and N/A for funds.
- Clicking a company's report date opens a reminder popup showing the last SEC report
  and the estimated next one, and emails the signed-in user on the chosen date. Users
  can see and cancel their scheduled reminders there. Email delivery needs SMTP
  settings on the API.
- All portfolio summary cards and all portfolio settings now sit on one row on wide
  screens, with shorter setting labels (Max position (%), Min cash (%), Time horizon).
- Analytics shows ETF/Index instead of Not Applicable for fund sectors and industries.
- Merged the duplicate sidebar entries: My current portfolio and Current Portfolio
  are now one Portfolio item, alongside Transactions and Analytics, with no sub-menu.
  The Admin page links back to Portfolio instead of Your book.
- Made text easier to read across the app: one type scale with 14px body text and
  nothing smaller than 12px; field labels, card labels, section labels, and table
  headings are now sentence case instead of small all-caps; extra-bold weights are
  reduced; and buttons, headings, and labels use consistent sentence case (for
  example Save changes, Add position, Unrealized gain/loss).
- Holdings table headings no longer overlap. Unrealized gain/loss and day change show
  the amount over the percentage instead of cutting it off, and the summary cards show
  the percentage on its own line. Saved portfolios read 1 holding instead of 1 holdings.
- Companies with "Trust" in their name, such as Northern Trust, are no longer treated
  as pooled trusts when the quote marks them as equities. They now keep Common Stock,
  their SEC sector, and normal risk-limit treatment.
- Added an Admin studio setting, Use transaction history in Analytics, on by default.
  When it is on and the recorded buys and sells reconcile exactly to the current
  shares, Analytics takes cost basis from transaction history and shows realized
  gain/loss and a transaction-based return. When it is off, or the history is
  incomplete, Analytics keeps the saved snapshot cost basis and says why.
- Moved the Current Portfolio, Transactions, and Analytics tabs into the left sidebar
  as sub-items under My current portfolio; the in-page tab strip is gone.
- Redesigned the web UI after BazarCRM: a dark left sidebar with a gold wordmark,
  account card, icon navigation, and sign out; Inter font; white background with
  light gray borders; gold primary buttons; gold-underlined tabs; and tables with
  uppercase headers, alternating rows, and a light-blue hover. Light mode only.
- Total Unrealized Gain/Loss and Today's Gain/Loss summary cards are now green when
  positive and red when negative.
- Analytics summary now shows Cash Balance as `$0 / 0.0%` and Unrealized Gain/Loss
  as `+$1,020 / +1.1%` in single cards instead of side-by-side pairs. Quantity and
  price boxes in the holdings table use tighter padding so the numbers stay readable.
- The colored bar on each holding row is now green when the unrealized gain is
  positive and red when it is negative, and the expand arrow points down when a row
  is collapsed and up when it is open.
- Rebuilt the inline transaction form as one compact line with equal-height controls,
  a price rounded to cents, and Cancel and Apply buttons.
- Added a Transactions portfolio tab with persisted buy/sell history, date, symbol,
  quantity, price, and total; recording a transaction now updates the position snapshot
  and history atomically.
- Replaced the expanded holding panel with one short row: Asset type and Sector
  dropdowns plus the Industry name. Investment category, returns, cost basis,
  provenance, lifecycle evidence, risk warnings, notes, and the extra Analyze button
  are no longer shown there.
- Removed Edit Position, View Details, and Add Note from the holding actions menu.
  Unrealized gain/loss figures in the summary and holdings table are now bold.
- Replaced Analytics allocation tabs with four simultaneously visible data boxes:
  Positions, Asset Types, Sectors, and Industries.
- Placed the Analytics controls and Risk Limits panels together in a 50/50 desktop
  row, with a stacked mobile layout.
- Made allocation boxes more compact and removed repeated position symbols and
  repeated allocation-total and within-limit labels.
- Displayed each allocation percentage and market value together on one line.
- Combined holdings and risk-warning counts into one summary value.
- Reordered Portfolio Allocation into a two-by-two layout: Positions beside
  Industries, then Sectors beside Asset Types.
- Renamed cost-basis attribution cards to Gains and Losses.
- Added a read-only Report Date column for operating companies. Security enrichment
  now retrieves the latest 10-Q/10-K filing date from SEC EDGAR when a position is
  added or refreshed, records its source, and persists it with saved portfolios.
- Removed the Analytics Exposure View dropdown. ETF, index, and other fund-like
  holdings remain visible with their values in allocation boxes, but are explicitly
  excluded from concentration, position, sector, asset-type, and speculative
  risk-limit calculations.
- Widened the holdings table Actions column so its heading and menu button stay
  visible inside the right edge.
- Lifecycle Phase and StockBuddy Status now start hidden. Their visibility controls
  still show either column, and the other columns expand to fill the row.
- Added separate sortable holdings columns for 1-month, 6-month, and 1-year returns
  and day change. A Returns control hides or shows all four, and the remaining columns
  expand to fill the row.
- Remaining holdings columns now share the freed width automatically when Lifecycle
  Phase or StockBuddy Status is hidden.
- Left-aligned the holdings table’s price, value, weight, and gain/loss figures
  with their column headings for easier row scanning.
- Reduced portfolio summary-card height and internal padding to remove excess space
  below each metric.
- Reduced holdings-table typography, column widths, gaps, and badge sizing so desktop
  headers and position values remain on one row without horizontal scrolling.
- Rebuilt Current Portfolio with cash-aware summary cards, a compact sortable holdings
  table that fits desktop and tablet widths, responsive mobile cards, editable
  quantity/purchase price, read-only calculated values, expandable evidence/details,
  optional Lifecycle and StockBuddy Status columns, accessible action menus, notes,
  snapshot transactions, and portfolio-level settings. Increased detail-row contrast,
  text size, and spacing, moved custom select chevrons five pixels inward, and made
  position action menus close on outside click or Escape.
- Added separate asset type, sector, industry, and fund investment-category
  classifications. ETFs/indexes now use `Not Applicable` rather than acting as sectors;
  completed Yahoo prices and FX rates supply currency-aware values and timestamps.
- Added confirmation previews for CSV and screenshot imports, including CSV column
  mapping, ticker/row validation, duplicate choices, and weighted-average-cost merging
  without silently replacing existing positions.
- Made portfolio updates atomic and backward compatible in Supabase, with persisted
  benchmark, base currency, limits, time horizon, rebalancing threshold, classifications,
  lifecycle evidence, and user notes.
- Rebuilt Analytics as a responsive portfolio dashboard with portfolio, benchmark,
  date-range, timestamp, refresh, and exposure-view controls; twelve corrected summary
  metrics grouped into eight cards across two desktop rows; a compact, expandable
  StockBuddy review above the performance graph;
  evidence-backed risk warnings in a two-column panel beside the performance graph;
  allocation tabs; and compact analytics panels without inherited empty height.
  top/bottom cost-basis contributors; concentration analytics; and module-level loading,
  missing, stale, unavailable, and refresh-failure handling. Removed the Fundamental
  Health, Lifecycle-Phase Allocation, Thesis Monitoring, and Upcoming Events panels
  from the Analytics page.
- Renamed ambiguous metrics to Portfolio Value, Total Cost Basis, Cash Balance,
  Unrealized Gain/Loss, Gains, Losses, and Sector Allocation.
  Funds are classified by asset type and are no longer treated as a sector or industry.
- Historical performance, benchmark comparison, advanced historical risk, ETF
  look-through, unsupported fundamentals, and unverified events now show explicit
  unavailable states instead of fabricated or zero values.
- Extracted typed portfolio analytics into reusable pure functions with tests for
  values, cost basis, gain/loss, weights, cash, concentration, risk-limit violations,
  fund exclusion, missing data, tiny allocations, contributors, and allocation totals.
- Added additive, RLS-protected Supabase storage for portfolio risk limits, versioned
  review-cache evidence, and verified portfolio events while preserving saved
  portfolio compatibility.
- Separated browser-safe workspace defaults and types from server-only Supabase helpers
  so the authenticated dashboard builds without importing `next/headers` into the client.
- Put book limits on one line, including one overall industry-position cap, and added
  a filled industry catalog used by the portfolio sector dropdown. Admins can add,
  rename, or remove industries in a non-scrolling multi-row grid, using consistent
  vector icons instead of emoji and uninterrupted name editing. Icons are generated
  automatically from industry names and avoid duplicates while unused icons remain.
- Placed the admin limits and model on one row, and the five persona prompts in one
  horizontally scrollable row. Added a distinct vector icon to every persona and
  verified edited prompts are included when the studio is saved.
- Updated the login page messaging to emphasize evidence-based stock research,
  SEC-sourced data, transparent analysis, and no brokerage access.
- Simplified the authenticated workspace into `Run test` and `My current portfolio`
  tabs, removing the large marketing header.
- Replaced the Financial Datasets price dependency with keyless public Yahoo Finance
  completed daily closes.
- Redesigned the portfolio page as a desktop split workspace with a narrow stock-entry
  sidebar and a wider holdings and analytics area.
- Widened the desktop portfolio-entry column for more comfortable stock and share inputs.
- Consolidated each editable holding into one complete row: symbol, company, shares,
  share price, total value, growth, and sector selector.
- Normalized share inputs so leading zeroes such as `012` display as `12`.
- Tightened holding-row typography, spacing, and responsive column widths so the
  seven data fields fit without horizontal scrolling.
- Rebalanced holding-row spacing and reserved a wider sector column so full industry
  names such as `Electronic Computers` are no longer clipped.
- Saving a selected portfolio now updates it instead of creating a duplicate.
- Added confirmed portfolio deletion; related positions and analysis records are removed
  by the existing database cascades.
- Replaced the unreliable browser-native delete dialog with visible inline Confirm
  delete and Cancel controls.
- Added industry-allocation reporting alongside stock allocation.
- Highlighted stocks and industries that exceed the Admin position limits, including
  the measured allocation and applicable cap.
- Mapped SEC industry descriptions into the broad sectors configured by Admin, with
  unmatched securities assigned to `Other`.
- Added an optional purchase-price column to manual entry, CSV import, API payloads, and
  persisted portfolio positions.
- Added icons to industry dropdowns and industry-allocation labels while preserving the
  configured industry names as stored values.
- Removed the large API-unavailable error banner from the portfolio workspace.
- Replaced the Manual/CSV/Picture tab strip with separate `+ Add stock`, `+ Add CSV`,
  and `+ Add Printscreen` actions, each opening its own focused popup.
- Added a default-off `Exclude ETF / Index` allocation filter. Public quote metadata
  identifies funds, and enabling the filter removes them from position percentages,
  industry allocation, and related limit highlighting.
- Simplified editable holding rows with borderless white inputs and sector selectors.
- Placed portfolio name and cash on one compact row, with the name given more space.
- Moved the stock, CSV, and printscreen add actions below the holdings table.
- Automatically opens the newest saved portfolio with its holdings when the workspace
  loads, and added a `Create new portfolio` reset action below saved portfolios.
- Added drag-and-drop plus up/down controls for ordering holdings, with the chosen order
  persisted on save.
- Added a Gain/Loss column showing dollar and percentage return from purchase price to
  the latest completed share price.
- Added separate Gains and Losses boxes with winning and losing stock counts and their
  aggregated dollar performance.
- Added two-direction holding-table sorting for symbol, shares, total value, gain/loss,
  and growth, with visible active-sort indicators.
- Expanded manual ordering so an entire holding row can be dragged; dragging or using
  move controls switches the table back to its persisted Custom order.
- Stacked Gains and Losses into separate full-width cards and added ticker-by-ticker
  company, dollar, and percentage results inside each card.
- The portfolio submit button now confirms a successful save with `Saved ✓` or
  `Updated ✓`, returning to its normal action label after another edit.
- Removed the redundant Market Value summary card; Cash and Total Portfolio now provide
  the two distinct top-level portfolio figures.
- Split the portfolio workspace into `Current Portfolio` and `Analytics` tabs. The
  editable holdings table now uses the full workspace width, while totals, gains/losses,
  stock allocation, and industry allocation live in Analytics.
- Removed the repeated portfolio page title and description, and added icons to the
  `Current Portfolio` and `Analytics` view tabs.
- Expanded the Analytics summary into four boxes: Cash, My Spent cost basis, Current
  Portfolio value, and Net Gain/Loss.
- Removed the duplicate detailed Net Gain/Loss card; the value remains in the four-box
  Analytics summary.
- Moved the ETF/Index exclusion control directly above allocations and placed Position
  Sizes and Industry Allocation side by side on desktop.
- Removed the row-level up/down movement arrows while retaining full-row drag-and-drop.
- Replaced the single Growth field with sortable 1-month, 6-month, and 1-year price
  performance columns calculated from public historical closes.
- Added a compact ticker-symbol list beneath every industry allocation.

### Added

- Separate user book and admin studio. The admin account can edit all five persona
  prompts, the position cap, the deep-value and trajectory sleeve weights, and the
  model id used by later reviews.
- Persistent project rule requiring architecture and functionality documentation.
- Mandatory verification before implementation work is reported as complete.
- Initial architecture document and Supabase security baseline.
- Next.js 16 web workspace with Supabase SSR authentication.
- FastAPI service that validates sessions and enforces portfolio ownership.
- Local Supabase migrations for portfolios, positions, analysis runs, persona signals,
  and recommendations, with RLS policies and pgTAP coverage.
- SEC EDGAR adapter with compliant identification, throttling, disk caching,
  point-in-time filing filters, TTM calculations, and explicit failure behavior.
- Composite data client that enriches SEC fundamentals with filing-date public Yahoo
  Finance closes.
- Pinned integration with the existing `aihf` engine instead of rewritten voting,
  risk, validation, cache, or order-sizing logic.
- Long-only 70/30 deep-value and trajectory mandate with a 25% position cap.
- Persisted background analysis jobs and sell/hold/add/trim recommendation logic based
  on post-risk weights.
- Responsive portfolio CSV import and analysis report showing all persona votes,
  confidence, reasoning, weights, marks, and share deltas.
- Accessible password visibility control on the sign-in and sign-up form.
- Manual, CSV, and screenshot portfolio entry with editable review before saving.
- OpenAI-backed extraction of visible ticker/share pairs from PNG, JPEG, and WebP
  portfolio screenshots without storing the uploaded image.
- Public price-adapter tests covering requests, parsing, empty results, and failures.
- SEC-backed company-name and ticker resolution. Entries such as `Apple` are normalized
  to `AAPL — Apple Inc.` before a portfolio is saved.
- Public quote-metadata fallback for valid ETF symbols that are absent from the SEC
  company-ticker directory.
- Holdings analytics for shares, latest completed share price, total value, approximately
  one-year growth, editable sector classification, portfolio totals, and allocation bars.
- Automated Python, TypeScript, build, mocked engine, and database policy checks.
