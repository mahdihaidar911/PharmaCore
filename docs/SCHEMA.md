# PharmaCore schema (pilot)

Created and migrated by `server/src/db/migrate.ts` on startup. Migrations only add tables, columns and
indexes, so existing databases upgrade in place.

All timestamps (`created_at`, …) are stored in **UTC** (`datetime('now')`). Reports group by the local day
with `date(col, 'localtime')`; the client parses them with `parseServerDate`. Expiry dates are plain
`YYYY-MM-DD` dates.

## Core tables

- `users` — `username` (case-insensitive login), `password_hash` (bcrypt), `role` (`owner` / `pharmacist` /
  `cashier`), `full_name`, `is_active`, `last_login_at`
- `pharmacy_settings` — exchange rate, address, receipt footer, profile/licence fields
- `products` — catalog, USD price, `min_stock`, `is_active`, MoPH fields (`moph_code` = رقم الوزارة,
  `brand_name`, `presentation`, official LBP price, …)
- `stock_batches` — qty, expiry, cost per batch
- `stock_movements` — trail of every stock change: `receive`, `sale`, `return`, `adjustment`
  (with `reason`: expired, damaged, lost, count_correction, other) and `user_id`
- `sales` / `sale_lines` — POS invoices with `exchange_rate_used`, discount, payments and change
- `returns` / `return_items` — refunds linked to sale lines
- `audit_logs` — who did what (sales, returns, stock, price overrides, settings, users, backups, imports)
- `ai_logs` — every assistant request: `user_id`, `kind` (chat / analyze / search), `prompt`, `response`,
  `tool_calls` (JSON), `model`, `status`, `error`, `latency_ms`

## Stock rules

- **FEFO:** sales deduct from the earliest `expiry_date` batch first, in one transaction
- **No negative stock:** sales and adjustments cannot take a batch below zero
- **Returns:** qty goes back to the original `batch_id`; refund = line share × (sale total ÷ line totals),
  so sale-level discounts are refunded proportionally
- **Exchange rate:** stored on each `sale` as `exchange_rate_used`

## Planned

- `include_in_reports` on sales (exclude from reports UI later)
- Held invoices, cash box/shifts, suppliers, customers (next phases)
