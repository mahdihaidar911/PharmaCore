import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { can, requireAuth, requirePermission } from "../middleware/auth.js";
import { isoDateSchema, LOCAL_DAY_SQL, localDateString, resolveRange } from "../services/dates.js";
import { BusinessError } from "../services/errors.js";
import {
  getDailyRevenue,
  getExpiringBatches,
  getInventoryMovements,
  getInventoryValuation,
  getLowStockProducts,
  getProfitSummary,
  getSalesSummary,
  getTopProducts,
} from "../services/reports.js";
import { ENTITY_PERMISSION, runStructuredQuery, structuredQuerySchema } from "../services/structuredQuery.js";

const router = Router();
router.use(requireAuth);

const rangeQuery = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() });

/** Wraps a handler so validation and range errors become 400 responses instead of 500s. */
function handle(fn: (req: Request, res: Response) => unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      return fn(req, res);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request" });
      }
      if (error instanceof RangeError || error instanceof BusinessError) {
        const status = error instanceof BusinessError ? error.status : 400;
        return res.status(status).json({ error: error.message });
      }
      return next(error);
    }
  };
}

function rangeFrom(req: Request) {
  const { from, to } = rangeQuery.parse(req.query);
  return resolveRange(from, to);
}

const intParam = (value: unknown, fallback: number, max: number) =>
  Math.min(max, Math.max(1, Number.parseInt(String(value ?? ""), 10) || fallback));

router.get(
  "/dashboard",
  handle((req, res) => {
    const date = isoDateSchema.optional().parse(req.query.date) ?? localDateString();
    const showSales = can(req, "reports.sales");
    const day = LOCAL_DAY_SQL("s.created_at");

    const salesToday = showSales
      ? db
          .prepare(`
            SELECT COUNT(*) as sale_count,
                   COALESCE(SUM(total_usd), 0) as total_usd, COALESCE(SUM(total_lbp), 0) as total_lbp,
                   COALESCE(SUM(paid_usd), 0) as paid_usd, COALESCE(SUM(paid_lbp), 0) as paid_lbp
            FROM sales s WHERE ${day} = ? AND include_in_reports = 1
          `)
          .get(date)
      : null;

    const salesByCashier = showSales
      ? db
          .prepare(`
            SELECT u.username, COUNT(s.id) as sale_count, COALESCE(SUM(s.total_usd), 0) as total_usd
            FROM sales s LEFT JOIN users u ON u.id = s.user_id
            WHERE ${day} = ? AND s.include_in_reports = 1
            GROUP BY s.user_id, u.username
          `)
          .all(date)
      : null;

    const topProducts = showSales
      ? getTopProducts({ from: date, to: date, limit: 10, sortBy: "units" }).products.map((p) => ({
          name: p.name,
          qty_sold: p.units_sold,
          revenue_usd: p.net_revenue_usd,
        }))
      : null;

    const low = getLowStockProducts({ limit: 50 });
    const expiring = getExpiringBatches({ withinDays: 90, limit: 50 });
    const expired = getExpiringBatches({ withinDays: 0, includeExpired: true, limit: 50 });
    const toAlert = (b: (typeof expiring.batches)[number]) => ({
      id: b.batch_id,
      qty: b.qty,
      expiry_date: b.expiry_date,
      product_name: b.name,
      barcode: b.barcode,
    });

    return res.json({
      date,
      salesToday,
      salesByCashier,
      topProducts,
      lowStock: low.products.map((p) => ({
        id: p.product_id,
        name: p.name,
        barcode: p.barcode,
        min_stock: p.min_stock,
        total_qty: p.total_qty,
      })),
      lowStockTotal: low.total_matching,
      outOfStockTotal: low.out_of_stock_count,
      nearExpiry: expiring.batches.map(toAlert),
      nearExpiryTotal: expiring.summary.batch_count,
      expired: expired.batches.map(toAlert),
      expiredTotal: expired.summary.batch_count,
    });
  }),
);

router.get("/sales-summary", requirePermission("reports.sales"), handle((req, res) => res.json(getSalesSummary(rangeFrom(req)))));

router.get("/daily-revenue", requirePermission("reports.sales"), handle((req, res) => res.json(getDailyRevenue(rangeFrom(req)))));

router.get(
  "/top-products",
  requirePermission("reports.sales"),
  handle((req, res) =>
    res.json(
      getTopProducts({
        ...rangeFrom(req),
        limit: intParam(req.query.limit, 20, 100),
        sortBy: req.query.sort === "revenue" ? "revenue" : "units",
      }),
    ),
  ),
);

router.get(
  "/low-stock",
  requirePermission("reports.inventory"),
  handle((req, res) =>
    res.json(getLowStockProducts({ limit: intParam(req.query.limit, 100, 500), onlyOutOfStock: req.query.out === "true" })),
  ),
);

router.get(
  "/expiring",
  requirePermission("reports.inventory"),
  handle((req, res) =>
    res.json(
      getExpiringBatches({
        withinDays: intParam(req.query.days, 90, 1825),
        minQty: req.query.min_qty ? intParam(req.query.min_qty, 1, 1_000_000) : undefined,
        includeExpired: req.query.include_expired === "true",
        limit: intParam(req.query.limit, 100, 500),
      }),
    ),
  ),
);

const movementTypes = ["receive", "sale", "return", "adjustment"] as const;

router.get(
  "/movements",
  requirePermission("inventory.view"),
  handle((req, res) => {
    const type = z.enum(movementTypes).optional().parse(req.query.type || undefined);
    return res.json(
      getInventoryMovements({
        ...rangeFrom(req),
        movementType: type,
        productId: req.query.product_id ? Number(req.query.product_id) : undefined,
        limit: intParam(req.query.limit, 200, 500),
      }),
    );
  }),
);

router.get("/profit", requirePermission("reports.profit"), handle((req, res) => res.json(getProfitSummary(rangeFrom(req)))));

router.get("/valuation", requirePermission("reports.profit"), handle((_req, res) => res.json(getInventoryValuation())));

router.post(
  "/query",
  handle((req, res) => {
    const query = structuredQuerySchema.parse(req.body);
    if (!can(req, ENTITY_PERMISSION[query.entity])) {
      return res.status(403).json({ error: "You do not have permission to view this data." });
    }
    return res.json(runStructuredQuery(query));
  }),
);

export default router;
