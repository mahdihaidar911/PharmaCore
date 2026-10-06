# PharmaCore testing guide

## Automated API tests (run first)

With the API running (`npm run dev` or `npm run dev:server`):

```bash
npm test
```

This runs `scripts/full-test.mjs` against `http://localhost:4000` and checks:

- Health, auth, settings
- Products pagination and search
- Inventory batches summary and pagination
- POS search rules (&lt;2 chars → empty)
- Create product → receive stock → checkout with change
- Sales, dashboard, MoPH status, MoPH price preview, backups

Override credentials if needed:

```bash
set TEST_USER=admin
set TEST_PASS=admin123
node scripts/full-test.mjs
```

## Production build

```bash
npm run build
```

Fix any TypeScript errors before release.

---

## Manual UI checklist

Use **admin / admin123** after `npm run dev` → http://localhost:5173

### Login & shell

- [ ] Login works; bad password shows error
- [ ] Logout / session persists on refresh
- [ ] Page scroll: only tables/panels scroll, not whole window

### Products

- [ ] Header shows total count (e.g. 10,000+ after MoPH import)
- [ ] Pagination: Previous/Next, “Showing 1–50 of …”
- [ ] Search by name, MoPH code, barcode resets to page 1
- [ ] Create manual product; edit barcode/price

### Inventory

- [ ] Summary: batches, units in stock, products with stock
- [ ] Pagination and search work
- [ ] Expiry colours (red ≤30d, amber ≤90d)

### Receive stock

- [ ] Search needs 2+ characters
- [ ] Receive on existing MoPH product increases stock
- [ ] “New product” mode still works

### POS

- [ ] Empty or 1-character search shows nothing (no full catalog load)
- [ ] 2+ chars finds MoPH code / name / barcode
- [ ] Cannot sell more than `total_qty`
- [ ] Checkout: discount, USD/LBP payment, **change to return** on receipt (no “amount paid” lines)
- [ ] Receipt print preview opens

### MoPH sync

- [ ] Section 1: catalog import (already done — skip unless refresh)
- [ ] Section 2: Check public price list → preview counts → Update prices (existing codes only)
- [ ] Last import timestamp updates after apply

### Sales & reports

- [ ] Sales list shows today’s transactions
- [ ] Dashboard loads (sales today, low stock, expiry)

### Backup

- [ ] Create backup; list shows new file

---

## MoPH files (optional re-test)

If you still have the May 2026 Downloads files:

1. MoPH sync → upload three files → Preview → Import catalog (only if testing refresh)
2. Compare product total ≈ 10k+ unique rows
3. Price sync: WebMarketed only → preview → apply

---

## When something fails

| Symptom | Fix |
|--------|-----|
| 404 / Not found on `/api/*` | Restart `npm run dev` (stale process on port 4000) |
| Login 500 | API not running — same restart |
| MoPH check timeout | Network/MoPH site slow; retry or upload WebMarketed manually |
| POS “no stock” | Receive stock first for that product |
