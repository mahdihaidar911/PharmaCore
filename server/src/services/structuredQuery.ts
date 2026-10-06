import { z } from "zod";
import type { Permission } from "../auth/permissions.js";
import { db } from "../db/index.js";
import { addDays, isoDateSchema, LOCAL_DAY_SQL, localDateString } from "./dates.js";
import { BusinessError, roundMoney } from "./errors.js";

/**
 * Validated, whitelisted filters for list-style questions ("batches expiring in 60 days with
 * more than 10 units"). Both the UI and the AI natural-language search produce these objects;
 * SQL is only ever assembled from fixed fragments with bound parameters.
 */

const text = z.string().trim().min(1).max(100);
const qty = z.number().int().min(0).max(1_000_000);
const money = z.number().min(0).max(1_000_000);

export const batchFiltersSchema = z
  .object({
    product_name: text.optional(),
    expires_within_days: z.number().int().min(0).max(1825).optional(),
    expired_only: z.boolean().optional(),
    min_qty: qty.optional(),
    max_qty: qty.optional(),
  })
  .strict();

export const productFiltersSchema = z
  .object({
    name_contains: text.optional(),
    category: text.optional(),
    stock_status: z.enum(["any", "in_stock", "low", "out_of_stock"]).optional(),
    min_qty: qty.optional(),
    max_qty: qty.optional(),
    min_price_usd: money.optional(),
    max_price_usd: money.optional(),
  })
  .strict();

export const saleFiltersSchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    min_total_usd: money.optional(),
    max_total_usd: money.optional(),
    payment_method: z.enum(["cash", "card", "mixed"]).optional(),
    cashier: text.optional(),
  })
  .strict();

export const structuredQuerySchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("batches"), filters: batchFiltersSchema.default({}), limit: z.number().int().min(1).max(200).default(100) }),
  z.object({ entity: z.literal("products"), filters: productFiltersSchema.default({}), limit: z.number().int().min(1).max(200).default(100) }),
  z.object({ entity: z.literal("sales"), filters: saleFiltersSchema.default({}), limit: z.number().int().min(1).max(200).default(100) }),
]);

export type StructuredQuery = z.infer<typeof structuredQuerySchema>;

export const ENTITY_PERMISSION: Record<StructuredQuery["entity"], Permission> = {
  batches: "reports.inventory",
  products: "products.view",
  sales: "reports.sales",
};

type Column = { key: string; label: string; type: "text" | "number" | "usd" | "date" | "datetime" };

export type StructuredQueryResult = {
  entity: StructuredQuery["entity"];
  applied_filters: string[];
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  truncated: boolean;
};

const like = (value: string) => `%${value.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function finish(
  entity: StructuredQuery["entity"],
  applied: string[],
  columns: Column[],
  countSql: string,
  rowsSql: string,
  binds: unknown[],
  limit: number,
): StructuredQueryResult {
  const { total } = db.prepare(countSql).get(...binds) as { total: number };
  const rows = db.prepare(rowsSql).all(...binds, limit) as Record<string, unknown>[];
  return { entity, applied_filters: applied, columns, rows, total, truncated: total > rows.length };
}

function queryBatches(f: z.infer<typeof batchFiltersSchema>, limit: number): StructuredQueryResult {
  const today = localDateString();
  const where = ["sb.qty > 0"];
  const binds: unknown[] = [];
  const applied: string[] = [];

  if (f.product_name) {
    where.push("LOWER(p.name) LIKE ? ESCAPE '\\'");
    binds.push(like(f.product_name));
    applied.push(`Product name contains "${f.product_name}"`);
  }
  if (f.expired_only) {
    where.push("sb.expiry_date <= ?");
    binds.push(today);
    applied.push("Already expired");
  } else if (f.expires_within_days !== undefined) {
    where.push("sb.expiry_date > ? AND sb.expiry_date <= ?");
    binds.push(today, addDays(today, f.expires_within_days));
    applied.push(`Expires within ${f.expires_within_days} days`);
  }
  if (f.min_qty !== undefined) {
    where.push("sb.qty >= ?");
    binds.push(f.min_qty);
    applied.push(`Quantity ≥ ${f.min_qty}`);
  }
  if (f.max_qty !== undefined) {
    where.push("sb.qty <= ?");
    binds.push(f.max_qty);
    applied.push(`Quantity ≤ ${f.max_qty}`);
  }

  const from = `FROM stock_batches sb JOIN products p ON p.id = sb.product_id WHERE ${where.join(" AND ")}`;
  return finish(
    "batches",
    applied,
    [
      { key: "product_name", label: "Product", type: "text" },
      { key: "batch_id", label: "Batch", type: "number" },
      { key: "qty", label: "Qty", type: "number" },
      { key: "expiry_date", label: "Expiry", type: "date" },
      { key: "days_left", label: "Days left", type: "number" },
      { key: "sale_price_usd", label: "Price", type: "usd" },
    ],
    `SELECT COUNT(*) AS total ${from}`,
    `SELECT p.name AS product_name, sb.id AS batch_id, sb.qty, sb.expiry_date, p.sale_price_usd,
            CAST(julianday(sb.expiry_date) - julianday('now', 'localtime', 'start of day') AS INTEGER) AS days_left
     ${from} ORDER BY sb.expiry_date ASC, sb.qty DESC LIMIT ?`,
    binds,
    limit,
  );
}

function queryProducts(f: z.infer<typeof productFiltersSchema>, limit: number): StructuredQueryResult {
  const where = ["p.is_active = 1"];
  const having: string[] = [];
  const binds: unknown[] = [];
  const havingBinds: unknown[] = [];
  const applied: string[] = [];

  if (f.name_contains) {
    where.push("(LOWER(p.name) LIKE ? ESCAPE '\\' OR LOWER(IFNULL(p.brand_name, '')) LIKE ? ESCAPE '\\')");
    binds.push(like(f.name_contains), like(f.name_contains));
    applied.push(`Name contains "${f.name_contains}"`);
  }
  if (f.category) {
    where.push("LOWER(IFNULL(p.category, '')) LIKE ? ESCAPE '\\'");
    binds.push(like(f.category));
    applied.push(`Category "${f.category}"`);
  }
  if (f.min_price_usd !== undefined) {
    where.push("p.sale_price_usd >= ?");
    binds.push(f.min_price_usd);
    applied.push(`Price ≥ $${f.min_price_usd}`);
  }
  if (f.max_price_usd !== undefined) {
    where.push("p.sale_price_usd <= ?");
    binds.push(f.max_price_usd);
    applied.push(`Price ≤ $${f.max_price_usd}`);
  }

  const status = f.stock_status ?? "any";
  if (status !== "any") {
    where.push("EXISTS (SELECT 1 FROM stock_batches x WHERE x.product_id = p.id)");
  }
  if (status === "in_stock") {
    having.push("total_qty > 0");
    applied.push("In stock");
  } else if (status === "low") {
    having.push("total_qty <= p.min_stock");
    applied.push("At or below minimum stock");
  } else if (status === "out_of_stock") {
    having.push("total_qty = 0");
    applied.push("Out of stock");
  }
  if (f.min_qty !== undefined) {
    having.push("total_qty >= ?");
    havingBinds.push(f.min_qty);
    applied.push(`Stock ≥ ${f.min_qty}`);
  }
  if (f.max_qty !== undefined) {
    having.push("total_qty <= ?");
    havingBinds.push(f.max_qty);
    applied.push(`Stock ≤ ${f.max_qty}`);
  }

  const inner = `
    SELECT p.id AS product_id, p.name, p.barcode, p.category, p.sale_price_usd, p.min_stock,
           COALESCE(SUM(sb.qty), 0) AS total_qty
    FROM products p LEFT JOIN stock_batches sb ON sb.product_id = p.id
    WHERE ${where.join(" AND ")}
    GROUP BY p.id
    ${having.length ? `HAVING ${having.join(" AND ")}` : ""}
  `;
  return finish(
    "products",
    applied,
    [
      { key: "name", label: "Product", type: "text" },
      { key: "barcode", label: "Barcode", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "total_qty", label: "Stock", type: "number" },
      { key: "min_stock", label: "Min", type: "number" },
      { key: "sale_price_usd", label: "Price", type: "usd" },
    ],
    `SELECT COUNT(*) AS total FROM (${inner})`,
    `SELECT * FROM (${inner}) ORDER BY total_qty DESC, name LIMIT ?`,
    [...binds, ...havingBinds],
    limit,
  );
}

function querySales(f: z.infer<typeof saleFiltersSchema>, limit: number): StructuredQueryResult {
  const where = ["s.include_in_reports = 1"];
  const binds: unknown[] = [];
  const applied: string[] = [];
  const day = LOCAL_DAY_SQL("s.created_at");

  if (f.from && f.to && f.from > f.to) {
    throw new BusinessError(`Start date ${f.from} is after end date ${f.to}`);
  }
  if (f.from) {
    where.push(`${day} >= ?`);
    binds.push(f.from);
    applied.push(`From ${f.from}`);
  }
  if (f.to) {
    where.push(`${day} <= ?`);
    binds.push(f.to);
    applied.push(`To ${f.to}`);
  }
  if (f.min_total_usd !== undefined) {
    where.push("s.total_usd >= ?");
    binds.push(f.min_total_usd);
    applied.push(`Total ≥ $${f.min_total_usd}`);
  }
  if (f.max_total_usd !== undefined) {
    where.push("s.total_usd <= ?");
    binds.push(f.max_total_usd);
    applied.push(`Total ≤ $${f.max_total_usd}`);
  }
  if (f.payment_method) {
    where.push("s.payment_method = ?");
    binds.push(f.payment_method);
    applied.push(`Paid by ${f.payment_method}`);
  }
  if (f.cashier) {
    where.push("LOWER(IFNULL(u.username, '')) = ?");
    binds.push(f.cashier.toLowerCase());
    applied.push(`Cashier ${f.cashier}`);
  }

  const from = `FROM sales s LEFT JOIN users u ON u.id = s.user_id WHERE ${where.join(" AND ")}`;
  const result = finish(
    "sales",
    applied,
    [
      { key: "id", label: "Invoice", type: "number" },
      { key: "created_at", label: "Date", type: "datetime" },
      { key: "cashier", label: "Cashier", type: "text" },
      { key: "payment_method", label: "Payment", type: "text" },
      { key: "item_count", label: "Items", type: "number" },
      { key: "total_usd", label: "Total", type: "usd" },
    ],
    `SELECT COUNT(*) AS total ${from}`,
    `SELECT s.id, s.created_at, u.username AS cashier, s.payment_method, s.total_usd,
            (SELECT COALESCE(SUM(qty), 0) FROM sale_lines WHERE sale_id = s.id) AS item_count
     ${from} ORDER BY s.created_at DESC LIMIT ?`,
    binds,
    limit,
  );
  result.rows = result.rows.map((r) => ({ ...r, total_usd: roundMoney(Number(r.total_usd)) }));
  return result;
}

export function runStructuredQuery(query: StructuredQuery): StructuredQueryResult {
  switch (query.entity) {
    case "batches":
      return queryBatches(query.filters, query.limit);
    case "products":
      return queryProducts(query.filters, query.limit);
    case "sales":
      return querySales(query.filters, query.limit);
  }
}
