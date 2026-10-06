# PharmaCore

Pharmacy management and point-of-sale system for independent pharmacies in Lebanon. It runs on **one
workstation, fully offline**, in the browser: fast checkout with USD/LBP, batch and expiry tracking, returns,
reports, backups, role-based access, and an optional AI business assistant that only works with real
PharmaCore data.

> Status: **pilot**. Suitable for a supervised pilot in one pharmacy. See [Known limitations](#known-limitations).

## Features

**Point of sale**
- Barcode scan or search (name, MoPH code, barcode), cart, quantity limits from live stock
- Prices always come from the catalog on the server; only owners may override a price (audited)
- Discounts (pharmacist/owner only), payment in USD, LBP or mixed, change calculation, browser receipt printing
- Stock deducted first-expiry-first-out (FEFO) across batches, inside one database transaction

**Inventory**
- Receive stock by batch with expiry and cost; full MoPH catalog import (~10k products)
- Stock adjustments with a reason (damaged, expired, count correction, …) and a movement history
- Expiry colouring, low-stock and out-of-stock lists that ignore never-stocked catalog items

**Sales & returns**
- Sales history with reprint; returns put stock back and refund the *discounted* share of each line

**Reports**
- Sales summary (net of discounts and refunds), daily revenue chart, top products, low stock, expiring
  batches, stock movements, profit with cost coverage (owner), inventory valuation; CSV export and print

**Users & security**
- Roles: **owner**, **pharmacist**, **cashier**, enforced on every API route (not just hidden in the UI)
- User management (owner), password change/reset, login throttling, disabling a user ends their session
- Audit log on sales, returns, stock changes, price overrides, settings, users, backups and imports

**Reliability**
- SQLite with WAL; one-click backups; restore validates the file and keeps a safety copy first

**AI business assistant** (optional, see [AI assistant](#ai-assistant))
- Ask questions ("What sold best this month?"), **✨ Analyze business**, natural-language smart search
- Permission-aware, grounded in backend tools, logged; never gives clinical advice

## Role permissions

| Capability | Cashier | Pharmacist | Owner |
|---|:-:|:-:|:-:|
| Sell, view sales, look up stock, link barcodes, inventory reports, AI assistant | ✓ | ✓ | ✓ |
| Discounts, returns, manage products, receive/adjust stock, sales reports, exchange rate, create backups | | ✓ | ✓ |
| Price override, profit reports, pharmacy settings/profile, users, restore backups, MoPH import, AI logs | | | ✓ |

Source of truth: `server/src/auth/permissions.ts`. The user's role is re-read from the database on every request.

## Stack

| Layer | Technology |
|---|---|
| Client | React 19, Vite 6, Tailwind CSS 4, React Router 7 |
| Server | Node.js, Express 4, TypeScript (ESM), Zod validation, JWT auth, bcrypt |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Tests | Node's built-in test runner + tsx, in-memory SQLite |
| AI (optional) | Any OpenAI-compatible Chat Completions API (OpenAI, Ollama, LM Studio) via built-in `fetch` |

SQLite is deliberate: one pharmacy, one PC, no network dependency, trivial backups (a single file).

## Architecture

```
Pharma/
├── client/                 React SPA
│   └── src/
│       ├── pages/          One page per screen (POS, Inventory, Reports, Assistant, Users, …)
│       ├── components/     Layout, design-system primitives (ui.tsx), icons, assistant panels
│       ├── context/        Auth (user, permissions, can()), settings
│       └── lib/            API client + types, CSV export, receipt template, safe markdown
├── server/
│   ├── src/
│   │   ├── app.ts          Express app factory (used by index.ts and the tests)
│   │   ├── config.ts       Environment configuration
│   │   ├── auth/           Permission matrix
│   │   ├── middleware/     requireAuth / requirePermission
│   │   ├── routes/         HTTP layer: validation + permission checks
│   │   ├── services/       Business logic: checkout, stock, reports, structured queries, dates
│   │   ├── ai/             Provider, tools, orchestrator, insights, NL search, prompts, logging
│   │   └── db/             Connection, migrations, seed
│   ├── tests/              API + unit tests
│   └── data/               pharmacore.db and backups/ (git-ignored)
├── docs/                   SCHEMA.md, TESTING.md, MOPH.md
└── scripts/                Dev helpers, legacy live smoke test
```

Business rules (prices, discounts, stock, refunds, permissions) live on the server. The client hides
controls the user cannot use, but the API rejects them regardless.

### AI assistant flow

```
User question ─► POST /api/ai/chat ─► orchestrator
                                       │  system prompt: date, rules, which tools this role lacks
                                       ▼
                         LLM (tool calling, max 5 rounds)
                                       │ tool call {name, args}
                                       ▼
          executeTool: role allowed? ─► Zod-validate args ─► fixed SQL in services/reports.ts
                                       │ JSON result (size-capped)
                                       ▼
                         LLM writes the answer ─► { answer, tool_calls, grounded } ─► ai_logs
```

- The model **never sees SQL or the database**; it can only call the 10 tools in `server/src/ai/tools.ts`.
- Tools a role cannot use are not offered, and are refused if called anyway.
- **Smart search**: the model produces a structured query (`entity` + filters); it is validated against a
  strict schema, permission-checked, then run with parameterised SQL. Invalid output → 422, never guessed.
- **Analyze business**: highlights are computed deterministically from real data; the AI only adds a narrative.
  If the AI is down, the data and highlights are still shown.
- Every request, tool call, status and error is stored in `ai_logs` (owner can read via `GET /api/ai/logs`).
- The prompt forbids clinical decisions (safety, dosing, interactions); those go to the pharmacist.

## Installation

Requirements: **Node.js 22 LTS or newer** (tested on Node 24), Windows/macOS/Linux.

```bash
cd Pharma
npm install
copy .env.example .env     # macOS/Linux: cp .env.example .env
npm run dev
```

- Web UI: http://localhost:5173 · API: http://localhost:4000
- First run creates the database and an **owner** account `admin` with the password from
  `INITIAL_ADMIN_PASSWORD` (default `admin123`). **Change it immediately** under *My account* (click your name in the sidebar).

If the API crashes with `better_sqlite3` / `NODE_MODULE_VERSION` after a Node upgrade: `npm run fix:native`.

## Configuration

All settings are environment variables, read from `.env` in the repo root or `server/`. See
[`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | dev secret | **Required in production** — the server refuses to start without it |
| `PORT` | `4000` | API port |
| `JWT_EXPIRES_IN` | `12h` | Session length |
| `PHARMACORE_DATA_DIR` | `server/data` | Database and backups folder |
| `INITIAL_ADMIN_PASSWORD` | `admin123` | Only used when the database is first created |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | — | Enables the assistant (`AI_MODEL` required; key optional for localhost) |
| `AI_TIMEOUT_MS`, `AI_MAX_TOOL_ROUNDS`, `AI_RATE_LIMIT`, `AI_RATE_WINDOW_MS` | 45000, 5, 30, 300000 | Assistant limits |

Exchange rate, address and receipt footer are set in the app (**Settings**); pharmacy name, pharmacist and
licence numbers under **Pharmacy profile**.

## Database

SQLite file at `server/data/pharmacore.db`, created and migrated automatically on startup (migrations are
additive and idempotent — existing data is preserved). Schema: [`docs/SCHEMA.md`](docs/SCHEMA.md).
MoPH catalog import: [`docs/MOPH.md`](docs/MOPH.md).

Backups (**Backup** page or `POST /api/backup/create`) go to `server/data/backups/`. **Copy them off the PC
regularly.** Restoring (owner only) validates the file, saves a safety copy of the current data, then
requires a server restart.

## Running in production

```bash
npm run build
set NODE_ENV=production
set JWT_SECRET=<long random string>
npm start
```

The server serves the built client from `client/dist` at http://localhost:4000.

## Testing

```bash
npm test           # 71 automated tests, in-memory database, no network
npm run typecheck
```

What is covered and the manual checklist: [`docs/TESTING.md`](docs/TESTING.md).

## Screenshots

Not yet captured for this version. To add: run `npm run dev`, capture POS, Dashboard, Reports and Assistant
at desktop and tablet width into `docs/screenshots/`.

## Known limitations

- **No customers / prescriptions** module yet, so there is no customer summary (AI or reports).
- **No suppliers / purchase orders**; stock is received manually or via MoPH catalog data.
- **No held invoices, cash drawer or shifts** (end-of-day cash reconciliation).
- **Receipts** print through the browser dialog; no direct ESC/POS thermal printer driver.
- **Single workstation**: no multi-terminal sync; SQLite is not meant for concurrent PCs over a network share.
- **Backups are manual** (no schedule) and stored on the same disk until copied elsewhere.
- **Login throttling and AI rate limits are in memory** and reset when the server restarts.
- The AI assistant needs an external or local LLM with tool calling; answer quality depends on the model.
- UI is in English only (product names may be Arabic); no Arabic/RTL interface yet.
- Automated tests cover the API and business logic; there are **no automated browser (E2E) tests**.

## Roadmap

1. Scheduled automatic backups + copy to a second drive/USB, backup age warning on the dashboard
2. Cash drawer / shift close with expected vs counted cash (USD and LBP)
3. Held invoices and quick re-open on POS
4. Suppliers and purchase orders; receive against a PO
5. Customers (optional) with purchase history → enables `get_customer_summary` for the assistant
6. Direct thermal printer support; Electron wrapper for kiosk-style startup
7. Arabic / RTL interface
8. Playwright end-to-end tests for POS and returns

## Notes for Lebanon

- Prices are stored in **USD**; LBP is derived from the exchange rate in Settings.
- Each sale stores the rate used at checkout, so past receipts and refunds stay correct after rate changes.
