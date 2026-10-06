# PharmaCore schema (pilot)

## Core tables

- `users` — login, `role` (owner/cashier/pharmacist later)
- `pharmacy_settings` — name, exchange rate, receipt footer
- `products` — catalog, USD price, `min_stock`, MoPH fields (`moph_code` = رقم الوزارة, `brand_name`, `presentation`, official LBP price, etc.)
- `stock_batches` — qty, expiry, cost per batch
- `stock_movements` — audit trail: receive, sale, return
- `sales` / `sale_lines` — POS invoices, rate snapshot
- `returns` / `return_items` — refunds linked to sale lines
- `audit_logs` — who did what

## Stock rules

- **FEFO:** sales deduct from earliest `expiry_date` batch first
- **Returns:** qty goes back to the original `batch_id`
- **Exchange rate:** stored on each `sale` as `exchange_rate_used`

## Planned (columns exist or tables reserved)

- `moph_code`, `official_price_lbp` on products
- `include_in_reports` on sales (exclude from reports UI later)
- Held invoices, cash box/shifts, suppliers (next phases)
