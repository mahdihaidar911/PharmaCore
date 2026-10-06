# PharmaCore testing guide

## Automated tests (run first)

```bash
npm test            # 84 server tests, ~3 s, no running server or internet needed
npm run typecheck   # server, test and client TypeScript
npm run build       # production build of client + server
```

`npm test` runs `server/tests/*.test.ts` with Node's built-in test runner (`node --test` + `tsx`, no extra
test framework). Each file starts the real Express app on a random port against an **in-memory SQLite
database** (`PHARMACORE_DB_PATH=:memory:`), so tests never touch `server/data/pharmacore.db`.
The AI tests use a scripted fake provider — no API key or network is needed. The test helper opens a cash
shift on startup, because sales and refunds require one.

| File | Covers |
|------|--------|
| `unit.test.ts` | Change calculation (USD / LBP / mixed), money rounding, date-range validation, permission matrix |
| `auth.test.ts` | Login, token required, login throttling, change password, user management (owner-only, duplicates, weak passwords, disabling revokes sessions, role changes apply immediately, last-owner protection, password reset) |
| `permissions.test.ts` | Cashier/pharmacist restrictions **enforced by the API** (products, stock, settings, backups, MoPH, returns, revenue/profit reports, structured queries), product edit keeps `is_active` |
| `sales.test.ts` | Server-side pricing (client price ignored without override), discount permission and limits, FEFO deduction, oversell rollback, LBP payment/change, insufficient payment, prorated refunds on discounted sales, over-return protection |
| `inventory-reports.test.ts` | Stock adjustments (reason, no negative stock, notes for "other"), low stock ignores never-stocked catalog items, expiring batches, net revenue after discounts/refunds, top products, profit + cost coverage, date-range validation, zero-filled daily revenue, structured queries (strict filters) |
| `stage2.test.ts` | Cash drawer (one open shift, selling/refunding blocked when closed, expected cash per currency with change, card sales, refunds and pay-outs, variance, cashier blind count and no history access, pay-in/out validation, AI shift tool permissions), held sales (merge, no cashier discount, current prices on resume, resume once, discard), expired stock (never sold, FEFO skips it, POS stock excludes it, cannot be received), backups (status, manual, owner-only second location with validation and copy, scheduler interval and pruning) |
| `ai.test.ts` | 503 when unconfigured, 502 on provider failure, payload validation, tool execution grounded in real data, "not grounded" flag, invalid arguments returned to the model, unknown tools, tool-loop limit, cashiers not offered revenue tools and blocked even if the model calls one, Analyze Business without AI and with AI failure, cashier snapshot excludes sales, natural-language search validation + permissions, AI audit log |

### Legacy smoke test (live server)

`scripts/full-test.mjs` checks a **running** instance (including the MoPH download, which needs internet):

```bash
npm run dev            # in another terminal
set TEST_USER=admin
set TEST_PASS=<your password>
npm run test:smoke
```

---

## Manual UI checklist

Run `npm run dev` → http://localhost:5173. Create a cashier and a pharmacist under **Users** first.

### Login, session, roles

- [ ] Wrong password shows an error; after 5 wrong attempts → "Too many failed attempts"
- [ ] Refresh keeps you logged in; disabling a user logs them out on their next action
- [ ] Cashier lands on POS; the sidebar shows only Sell / stock lookup / Assistant items
- [ ] Pharmacist: Settings shows address and footer read-only, exchange rate editable
- [ ] Backup: Restore button only visible to the owner; restore asks for confirmation
- [ ] Backup: status shows last backup age; setting a second location to a missing folder is refused;
      a valid USB folder receives a copy of the next backup
- [ ] Products: owner/pharmacist can untick Active; the product disappears from POS and reappears with "Show inactive"
- [ ] Receive stock: past expiry dates are refused; expiry within 90 days shows a short-dated warning
- [ ] Tablet width (< 1024 px): sidebar becomes a drawer opened from the top bar

### Products

- [ ] Pagination, search by name / MoPH code / barcode
- [ ] Owner/pharmacist can create and edit; cashier sees the list only

### Inventory

- [ ] Expiry colours (red ≤ 30 days, amber ≤ 90 days)
- [ ] Adjust: write off 1 unit as "damaged" → quantity drops; it appears in Reports → Stock movements

### Cash drawer

- [ ] With no shift open, POS shows "The cash drawer is closed" and Complete sale is disabled
- [ ] Open a shift with a float; make a USD sale with change, an LBP sale and a card sale
- [ ] Pay-out requires a reason; it appears in the list
- [ ] As cashier: no expected amounts are shown; closing shows "Your count was recorded"
- [ ] As owner/pharmacist: expected USD/LBP match a hand count; closing shows the difference; Print report opens
- [ ] Recent shifts lists the difference; clicking a row opens the detail

### POS

- [ ] Hold sale (with a label) clears the cart; Held sales shows it; Resume restores it at current prices
- [ ] Resume is refused while another cart is in progress
- [ ] A product whose only stock is expired shows stock 0 and cannot be sold
- [ ] Search needs 2+ characters; barcode scan + Enter adds to cart
- [ ] Cannot sell more than in stock
- [ ] Discount field hidden for cashiers; discount above subtotal disables Complete sale
- [ ] USD / LBP / mixed payment; receipt shows change to return

### Returns

- [ ] Discounted sale → refund suggestion is the discounted amount
- [ ] "Refund all in USD" / "Refund all in LBP" each fill only one currency

### Reports

- [ ] Date presets; daily chart; CSV export opens in Excel with Arabic names intact
- [ ] Profit section visible to owner only

### AI assistant (requires `AI_MODEL` in `.env`)

- [ ] Without configuration: status badge says not configured; Analyze Business still shows highlights
- [ ] "What were sales this week?" → answer with source badges
- [ ] As cashier, "What was revenue yesterday?" → refused, explains who can see it
- [ ] Smart search: "batches expiring in 60 days with more than 10 units" → filter chips + table
- [ ] Clinical question ("is X safe with Y?") → declines and refers to the pharmacist

---

## When something fails

| Symptom | Fix |
|--------|-----|
| 404 on `/api/*` | Restart `npm run dev` (stale process on port 4000) |
| API crashes with `NODE_MODULE_VERSION` | `npm run fix:native` |
| "The database was restored. Restart…" | Restart the server after a backup restore |
| AI returns 502 | Check `AI_API_KEY` / `AI_BASE_URL`; the message names the cause (auth, rate limit, timeout) |
| POS "Not enough stock" | Receive stock for that product first |
