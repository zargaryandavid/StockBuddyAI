# MyPortfolioBuddy

MyPortfolioBuddy is a filing-driven, long-only portfolio review application. It gives five
investment personas the same point-in-time SEC snapshot, applies the existing AI Hedge
Fund blend and risk engine, and records a sell, hold, add, or trim report. It never sends
orders to a broker.

## Prerequisites

- Node.js 24+
- `uv`
- Docker Desktop or another Docker-compatible runtime
- An OpenAI API key
- A real name/application and contact email for the SEC `User-Agent`

## Local setup

```bash
cp .env.example .env
npm install
npx supabase start
```

Copy the local API URL, publishable key, and service-role key printed by Supabase into
`.env`. Also set the SEC identity, OpenAI model, and OpenAI key. No market-data API key
is required: SEC EDGAR supplies fundamentals and the public Yahoo Finance chart response
supplies completed daily closes. Then copy browser variables into `apps/web/.env.local`.

```bash
cd apps/api
uv sync --dev
uv run uvicorn stockbuddy.main:app --reload
```

In a second terminal:

```bash
npm run dev:web
```

Open `http://localhost:3000`, create an account, and add holdings manually, import a
CSV, or upload a portfolio screenshot for extraction and review:

```text
ticker,shares
AAPL,20
MSFT,10
```

CSV imports may also include an optional `purchase_price` column.

Cash is entered separately because shares alone are insufficient to calculate current
portfolio weights and order deltas.

## Verification

```bash
cd apps/api && uv run ruff check src tests && uv run pytest
npm run test:web
npm run lint:web
npm run build:web
npm run supabase:test
```

See `docs/ARCHITECTURE.md` for system design and `docs/OPERATIONS.md` for data,
security, and failure behavior.
