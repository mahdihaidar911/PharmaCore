# PharmaCore

On-premise pharmacy system for independent pharmacies in Lebanon. Phase 0 covers local auth, settings, manual product catalog, stock receiving, and batch inventory.

## Stack

- **Client:** React + Vite + Tailwind CSS
- **Server:** Node.js + Express + SQLite
- **Deploy:** One PC, offline-first, browser UI

## Quick start

Use **Node.js 22 LTS** (or rebuild native modules after upgrading Node — see troubleshooting below).

```bash
npm install
npm run dev
```

If the API crashes on startup with `better_sqlite3` / `NODE_MODULE_VERSION`, stop the app and run:

```bash
npm run fix:native
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:4000

Default login:

- Username: `admin`
- Password: `admin123`

Change this before production use.

## Pilot features (V1 slice)

- Pharmacy settings with adjustable LBP/USD exchange rate
- Manual product catalog + receive stock (batch/expiry)
- **POS** — search/barcode, cart, discount, pay USD/LBP/mixed, FEFO stock deduction
- **Receipt print** — browser print dialog (thermal printer setup later)
- **Sales history** — view invoices, reprint
- **Returns** — return lines to stock, refund validation
- **Reports** — daily sales, top products, low stock, expiry alerts
- **Backup/restore** — `data/backups/` (restart server after restore)
- **MoPH import** (`/moph`) — upload or fetch official WebMarketed `.xls`, upsert by MoPH code, optional price sync
- POS search only when you type (min. 2 chars) — no full stock list on the screen
- Receipt shows **change to return** only (not what the customer paid)
- Audit log on sales, returns, stock receive, backups, MoPH import

SQLite database: `data/pharmacore.db` — see `docs/SCHEMA.md`

## Next up

- Roles (owner / cashier / pharmacist)
- Held invoices, cash box / shifts
- Suppliers + purchase orders
- MoPH “Sync now” button on dashboard (re-import URL + apply price updates)
- Electron desktop wrapper

## Production build

```bash
npm run build
npm start
```

The server serves the built client from `client/dist`.

## Notes for Lebanon

- Product prices are stored in **USD**
- LBP is calculated from the exchange rate in Settings
- Each future sale will snapshot the rate used at checkout
