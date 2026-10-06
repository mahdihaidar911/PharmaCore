import { db } from "../db/index.js";
import { addDays, daysInclusive, LOCAL_DAY_SQL, localDateString, type DateRange } from "./dates.js";
import { roundMoney } from "./errors.js";

/**
 * Reporting queries shared by the REST reports, the dashboard and the AI assistant tools.
 * Money is USD unless a field says otherwise. Revenue figures are "net": after the sale-level
 * discount, which is shared proportionally across that sale's lines.
 */

const SALE_DAY = LOCAL_DAY_SQL("s.created_at");
const IN_RANGE = `${SALE_DAY} BETWEEN ? AND ?`;

/** Share of each line's list price actually charged after the sale-level discount. */
const NET_RATIO = `CASE WHEN st.subtotal > 0 THEN s.total_usd / st.subtotal ELSE 0 END`;
const SUBTOTALS_JOIN = `JOIN (SELECT sale_id, SUM(line_total_usd) AS subtotal FROM sale_lines GROUP BY sale_id) st ON st.sale_id = s.id`;

/** A product counts as "stocked" once it has been received at least once (excludes untouched MoPH catalog rows). */
const STOCKED_PRODUCT = `EXISTS (SELECT 1 FROM stock_batches x WHERE x.product_id = p.id)`;

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

export function getSalesSummary(range: DateRange) {
  const totals = db
    .prepare(`
      SELECT
        COUNT(*) AS sale_count,
        COALESCE(SUM(s.total_usd), 0) AS net_revenue_usd,
        COALESCE(SUM(s.discount_usd), 0) AS discounts_usd,
        COALESCE(SUM(s.total_lbp), 0) AS net_revenue_lbp
      FROM sales s
      WHERE s.include_in_reports = 1 AND ${IN_RANGE}
    `)
    .get(range.from, range.to) as {
    sale_count: number;
    net_revenue_usd: number;
    discounts_usd: number;
    net_revenue_lbp: number;
  };

  const units = db
    .prepare(`
      SELECT COALESCE(SUM(sl.qty), 0) AS units_sold, COUNT(DISTINCT sl.product_id) AS distinct_products
      FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
      WHERE s.include_in_reports = 1 AND ${IN_RANGE}
    `)
    .get(range.from, range.to) as { units_sold: number; distinct_products: number };

  const refunds = db
    .prepare(`
      SELECT COUNT(*) AS return_count,
             COALESCE(SUM(r.refund_usd + r.refund_lbp / r.exchange_rate_used), 0) AS refunds_usd
      FROM returns r
      WHERE ${LOCAL_DAY_SQL("r.created_at")} BETWEEN ? AND ?
    `)
    .get(range.from, range.to) as { return_count: number; refunds_usd: number };

  const byPaymentMethod = db
    .prepare(`
      SELECT s.payment_method, COUNT(*) AS sale_count, COALESCE(SUM(s.total_usd), 0) AS net_revenue_usd
      FROM sales s
      WHERE s.include_in_reports = 1 AND ${IN_RANGE}
      GROUP BY s.payment_method ORDER BY net_revenue_usd DESC
    `)
    .all(range.from, range.to) as { payment_method: string; sale_count: number; net_revenue_usd: number }[];

  const byCashier = db
    .prepare(`
      SELECT COALESCE(u.username, 'unknown') AS cashier, COUNT(*) AS sale_count,
             COALESCE(SUM(s.total_usd), 0) AS net_revenue_usd
      FROM sales s LEFT JOIN users u ON u.id = s.user_id
      WHERE s.include_in_reports = 1 AND ${IN_RANGE}
      GROUP BY s.user_id ORDER BY net_revenue_usd DESC
    `)
    .all(range.from, range.to) as { cashier: string; sale_count: number; net_revenue_usd: number }[];

  return {
    period: { ...range, days: daysInclusive(range.from, range.to) },
    sale_count: totals.sale_count,
    net_revenue_usd: roundMoney(totals.net_revenue_usd),
    net_revenue_lbp: Math.round(totals.net_revenue_lbp),
    discounts_usd: roundMoney(totals.discounts_usd),
    average_sale_usd: totals.sale_count ? roundMoney(totals.net_revenue_usd / totals.sale_count) : 0,
    units_sold: units.units_sold,
    distinct_products_sold: units.distinct_products,
    return_count: refunds.return_count,
    refunds_usd: roundMoney(refunds.refunds_usd),
    revenue_after_refunds_usd: roundMoney(totals.net_revenue_usd - refunds.refunds_usd),
    by_payment_method: byPaymentMethod.map((r) => ({ ...r, net_revenue_usd: roundMoney(r.net_revenue_usd) })),
    by_cashier: byCashier.map((r) => ({ ...r, net_revenue_usd: roundMoney(r.net_revenue_usd) })),
  };
}

export function getDailyRevenue(range: DateRange) {
  const rows = db
    .prepare(`
      SELECT ${SALE_DAY} AS day, COUNT(*) AS sale_count, COALESCE(SUM(s.total_usd), 0) AS net_revenue_usd
      FROM sales s
      WHERE s.include_in_reports = 1 AND ${IN_RANGE}
      GROUP BY day ORDER BY day
    `)
    .all(range.from, range.to) as { day: string; sale_count: number; net_revenue_usd: number }[];

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days: { date: string; sale_count: number; net_revenue_usd: number }[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const row = byDay.get(d);
    days.push({ date: d, sale_count: row?.sale_count ?? 0, net_revenue_usd: roundMoney(row?.net_revenue_usd ?? 0) });
  }
  return { period: range, days };
}

export function getTopProducts(params: DateRange & { limit: number; sortBy: "units" | "revenue" }) {
  const order = params.sortBy === "revenue" ? "net_revenue_usd DESC" : "units_sold DESC";
  const rows = db
    .prepare(`
      SELECT p.id AS product_id, p.name, p.barcode,
             SUM(sl.qty) AS units_sold,
             SUM(sl.qty_returned) AS units_returned,
             SUM(sl.line_total_usd * ${NET_RATIO}) AS net_revenue_usd,
             COUNT(DISTINCT s.id) AS sale_count,
             (SELECT COALESCE(SUM(b.qty), 0) FROM stock_batches b WHERE b.product_id = p.id) AS current_stock
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      ${SUBTOTALS_JOIN}
      JOIN products p ON p.id = sl.product_id
      WHERE s.include_in_reports = 1 AND ${IN_RANGE}
      GROUP BY p.id
      ORDER BY ${order}, p.name
      LIMIT ?
    `)
    .all(params.from, params.to, params.limit) as {
    product_id: number;
    name: string;
    barcode: string | null;
    units_sold: number;
    units_returned: number;
    net_revenue_usd: number;
    sale_count: number;
    current_stock: number;
  }[];

  return {
    period: { from: params.from, to: params.to },
    sort_by: params.sortBy,
    products: rows.map((r) => ({ ...r, net_revenue_usd: roundMoney(r.net_revenue_usd) })),
  };
}

export function getLowStockProducts(params: { limit: number; onlyOutOfStock?: boolean }) {
  const having = params.onlyOutOfStock ? "total_qty = 0" : "total_qty <= p.min_stock";
  const base = `
    SELECT p.id AS product_id, p.name, p.barcode, p.min_stock, COALESCE(SUM(sb.qty), 0) AS total_qty
    FROM products p
    LEFT JOIN stock_batches sb ON sb.product_id = p.id
    WHERE p.is_active = 1 AND ${STOCKED_PRODUCT}
    GROUP BY p.id
    HAVING ${having}
  `;
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM (${base})`).get() as { total: number };
  const { out_of_stock } = db
    .prepare(`SELECT COUNT(*) AS out_of_stock FROM (${base}) WHERE total_qty = 0`)
    .get() as { out_of_stock: number };

  const thirtyDaysAgo = addDays(localDateString(), -29);
  const products = db
    .prepare(`
      SELECT low.*,
        (SELECT COALESCE(SUM(sl.qty), 0) FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
         WHERE sl.product_id = low.product_id AND ${SALE_DAY} >= ?) AS units_sold_last_30_days
      FROM (${base}) low
      ORDER BY units_sold_last_30_days DESC, low.total_qty ASC, low.name
      LIMIT ?
    `)
    .all(thirtyDaysAgo, params.limit) as {
    product_id: number;
    name: string;
    barcode: string | null;
    min_stock: number;
    total_qty: number;
    units_sold_last_30_days: number;
  }[];

  return {
    definition: params.onlyOutOfStock
      ? "Stocked products (received at least once) with zero units left"
      : "Stocked products (received at least once) at or below their minimum stock level",
    total_matching: total,
    out_of_stock_count: out_of_stock,
    products,
  };
}

export function getExpiringBatches(params: {
  withinDays: number;
  minQty?: number;
  includeExpired?: boolean;
  limit: number;
}) {
  const today = localDateString();
  const until = addDays(today, params.withinDays);
  const minQty = params.minQty ?? 1;
  const where = `sb.expiry_date <= @until AND sb.qty >= @minQty ${params.includeExpired ? "" : "AND sb.expiry_date > @today"}`;
  const binds = { until, minQty, today };
  const from = "FROM stock_batches sb JOIN products p ON p.id = sb.product_id";

  const summary = db
    .prepare(`
      SELECT COUNT(*) AS batch_count, COUNT(DISTINCT sb.product_id) AS product_count,
             COALESCE(SUM(sb.qty), 0) AS units,
             COALESCE(SUM(sb.qty * p.sale_price_usd), 0) AS retail_value_usd,
             COALESCE(SUM(CASE WHEN sb.expiry_date <= @today THEN 1 ELSE 0 END), 0) AS already_expired_batches
      ${from} WHERE ${where}
    `)
    .get(binds) as {
    batch_count: number;
    product_count: number;
    units: number;
    retail_value_usd: number;
    already_expired_batches: number;
  };

  const batches = db
    .prepare(`
      SELECT sb.id AS batch_id, p.id AS product_id, p.name, p.barcode, sb.qty, sb.expiry_date, sb.cost_usd,
             p.sale_price_usd, CAST(julianday(sb.expiry_date) - julianday(@today) AS INTEGER) AS days_left
      ${from} WHERE ${where}
      ORDER BY sb.expiry_date ASC, sb.qty DESC
      LIMIT @limit
    `)
    .all({ ...binds, limit: params.limit }) as {
    batch_id: number;
    product_id: number;
    name: string;
    barcode: string | null;
    qty: number;
    expiry_date: string;
    cost_usd: number | null;
    sale_price_usd: number;
    days_left: number;
  }[];

  return {
    today,
    window: { within_days: params.withinDays, until, min_qty: params.minQty ?? 1, include_expired: Boolean(params.includeExpired) },
    summary: { ...summary, retail_value_usd: roundMoney(summary.retail_value_usd) },
    batches,
  };
}

export function getInventoryMovements(params: DateRange & {
  movementType?: "receive" | "sale" | "return" | "adjustment";
  productId?: number;
  limit: number;
}) {
  const filters = [`${LOCAL_DAY_SQL("m.created_at")} BETWEEN ? AND ?`];
  const binds: (string | number)[] = [params.from, params.to];
  if (params.movementType) {
    filters.push("m.movement_type = ?");
    binds.push(params.movementType);
  }
  if (params.productId) {
    filters.push("m.product_id = ?");
    binds.push(params.productId);
  }
  const where = filters.join(" AND ");

  const totals = db
    .prepare(`
      SELECT m.movement_type, COUNT(*) AS movement_count, COALESCE(SUM(m.qty_change), 0) AS net_units
      FROM stock_movements m WHERE ${where}
      GROUP BY m.movement_type ORDER BY m.movement_type
    `)
    .all(...binds) as { movement_type: string; movement_count: number; net_units: number }[];

  const movements = db
    .prepare(`
      SELECT m.id, m.created_at, m.movement_type, m.qty_change, m.reason, m.notes, m.reference_id,
             m.batch_id, p.id AS product_id, p.name AS product_name, u.username
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN users u ON u.id = m.user_id
      WHERE ${where}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ?
    `)
    .all(...binds, params.limit);

  return { period: { from: params.from, to: params.to }, totals_by_type: totals, movements };
}

export function getProfitSummary(range: DateRange) {
  const row = db
    .prepare(`
      SELECT
        COALESCE(SUM(sl.line_total_usd * ${NET_RATIO} * (sl.qty - sl.qty_returned) / sl.qty), 0) AS net_revenue_usd,
        COALESCE(SUM(CASE WHEN sb.cost_usd IS NOT NULL
          THEN sl.line_total_usd * ${NET_RATIO} * (sl.qty - sl.qty_returned) / sl.qty END), 0) AS revenue_with_cost_usd,
        COALESCE(SUM(CASE WHEN sb.cost_usd IS NOT NULL THEN sb.cost_usd * (sl.qty - sl.qty_returned) END), 0) AS cost_usd,
        COALESCE(SUM(sl.qty - sl.qty_returned), 0) AS units,
        COALESCE(SUM(CASE WHEN sb.cost_usd IS NOT NULL THEN sl.qty - sl.qty_returned END), 0) AS units_with_cost
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      ${SUBTOTALS_JOIN}
      JOIN stock_batches sb ON sb.id = sl.batch_id
      WHERE s.include_in_reports = 1 AND ${IN_RANGE}
    `)
    .get(range.from, range.to) as {
    net_revenue_usd: number;
    revenue_with_cost_usd: number;
    cost_usd: number;
    units: number;
    units_with_cost: number;
  };

  const grossProfit = row.revenue_with_cost_usd - row.cost_usd;
  return {
    period: range,
    note: "Profit is computed only for units whose batch has a recorded purchase cost. Returned units are excluded.",
    net_revenue_usd: roundMoney(row.net_revenue_usd),
    revenue_with_known_cost_usd: roundMoney(row.revenue_with_cost_usd),
    cost_of_goods_usd: roundMoney(row.cost_usd),
    gross_profit_usd: roundMoney(grossProfit),
    gross_margin_percent: pct(grossProfit, row.revenue_with_cost_usd),
    cost_coverage_percent: pct(row.units_with_cost, row.units),
  };
}

export function getInventoryValuation() {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS batch_count, COUNT(DISTINCT sb.product_id) AS product_count,
             COALESCE(SUM(sb.qty), 0) AS units,
             COALESCE(SUM(sb.qty * p.sale_price_usd), 0) AS retail_value_usd,
             COALESCE(SUM(CASE WHEN sb.cost_usd IS NOT NULL THEN sb.qty * sb.cost_usd END), 0) AS cost_value_usd,
             COALESCE(SUM(CASE WHEN sb.cost_usd IS NULL THEN 1 ELSE 0 END), 0) AS batches_without_cost
      FROM stock_batches sb JOIN products p ON p.id = sb.product_id
      WHERE sb.qty > 0
    `)
    .get() as {
    batch_count: number;
    product_count: number;
    units: number;
    retail_value_usd: number;
    cost_value_usd: number;
    batches_without_cost: number;
  };
  return {
    as_of: localDateString(),
    ...row,
    retail_value_usd: roundMoney(row.retail_value_usd),
    cost_value_usd: roundMoney(row.cost_value_usd),
  };
}

/** Compares a period with the immediately preceding period of the same length. */
export function compareSalesPeriods(range: DateRange) {
  const length = daysInclusive(range.from, range.to);
  const previous = { from: addDays(range.from, -length), to: addDays(range.from, -1) };
  const current = getSalesSummary(range);
  const prior = getSalesSummary(previous);
  const change = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

  return {
    current: pickHeadline(current),
    previous: pickHeadline(prior),
    change_percent: {
      net_revenue_usd: change(current.net_revenue_usd, prior.net_revenue_usd),
      sale_count: change(current.sale_count, prior.sale_count),
      average_sale_usd: change(current.average_sale_usd, prior.average_sale_usd),
      units_sold: change(current.units_sold, prior.units_sold),
    },
  };
}

function pickHeadline(summary: ReturnType<typeof getSalesSummary>) {
  const { by_payment_method: _p, by_cashier: _c, ...headline } = summary;
  return headline;
}

export function searchStock(query: string, limit: number) {
  const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .prepare(`
      SELECT p.id AS product_id, p.name, p.barcode, p.category, p.sale_price_usd, p.min_stock, p.is_active,
             COALESCE(SUM(sb.qty), 0) AS total_qty,
             MIN(CASE WHEN sb.qty > 0 THEN sb.expiry_date END) AS nearest_expiry
      FROM products p LEFT JOIN stock_batches sb ON sb.product_id = p.id
      WHERE LOWER(p.name) LIKE ? ESCAPE '\\' OR p.barcode = ? OR LOWER(IFNULL(p.brand_name, '')) LIKE ? ESCAPE '\\'
      GROUP BY p.id
      ORDER BY total_qty DESC, p.name
      LIMIT ?
    `)
    .all(pattern, query, pattern, limit);
}
