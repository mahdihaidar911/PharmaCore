import { z } from "zod";
import { hasPermission, rolesWithPermission, type Permission, type Role } from "../auth/permissions.js";
import { isoDateSchema, resolveRange } from "../services/dates.js";
import { BusinessError } from "../services/errors.js";
import {
  compareSalesPeriods,
  getDailyRevenue,
  getExpiringBatches,
  getInventoryMovements,
  getInventoryValuation,
  getLowStockProducts,
  getProfitSummary,
  getSalesSummary,
  getTopProducts,
  searchStock,
} from "../services/reports.js";
import { listShifts } from "../services/shifts.js";
import type { ToolSpec } from "./provider.js";

/**
 * The only way the assistant can read PharmaCore data. Each tool wraps a reporting service,
 * declares the permission it needs, and validates its arguments before anything runs.
 */
type AiTool = {
  name: string;
  description: string;
  permission: Permission;
  schema: z.ZodTypeAny;
  parameters: Record<string, unknown>;
  run(args: any): unknown;
};

const dateRangeSchema = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() }).strict();
const dateRangeParams = {
  from: { type: "string", description: "Start date, inclusive, YYYY-MM-DD. Defaults to 29 days before `to`." },
  to: { type: "string", description: "End date, inclusive, YYYY-MM-DD. Defaults to today." },
};
const objectParams = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const AI_TOOLS: AiTool[] = [
  {
    name: "get_sales_summary",
    description:
      "Sales totals for a date range: number of sales, net revenue (after discounts), discounts, units sold, refunds, average sale, and breakdown by payment method and cashier.",
    permission: "reports.sales",
    schema: dateRangeSchema,
    parameters: objectParams(dateRangeParams),
    run: (a: z.infer<typeof dateRangeSchema>) => getSalesSummary(resolveRange(a.from, a.to)),
  },
  {
    name: "compare_sales_periods",
    description:
      "Compares sales in a date range with the immediately preceding period of the same length (e.g. this week vs last week). Use for growth/decline questions.",
    permission: "reports.sales",
    schema: dateRangeSchema,
    parameters: objectParams(dateRangeParams),
    run: (a: z.infer<typeof dateRangeSchema>) => compareSalesPeriods(resolveRange(a.from, a.to)),
  },
  {
    name: "get_daily_revenue",
    description: "Net revenue and number of sales for each day in a date range (days without sales are included as zero).",
    permission: "reports.sales",
    schema: dateRangeSchema,
    parameters: objectParams(dateRangeParams),
    run: (a: z.infer<typeof dateRangeSchema>) => getDailyRevenue(resolveRange(a.from, a.to)),
  },
  {
    name: "get_top_products",
    description: "Best-selling products in a date range, ranked by units sold or by net revenue. Includes current stock for each.",
    permission: "reports.sales",
    schema: dateRangeSchema.extend({
      limit: z.number().int().min(1).max(50).default(10),
      sort_by: z.enum(["units", "revenue"]).default("units"),
    }),
    parameters: objectParams({
      ...dateRangeParams,
      limit: { type: "integer", minimum: 1, maximum: 50, description: "How many products (default 10)." },
      sort_by: { type: "string", enum: ["units", "revenue"], description: "Ranking criterion (default units)." },
    }),
    run: (a: { from?: string; to?: string; limit: number; sort_by: "units" | "revenue" }) =>
      getTopProducts({ ...resolveRange(a.from, a.to), limit: a.limit, sortBy: a.sort_by }),
  },
  {
    name: "get_low_stock_products",
    description:
      "Products the pharmacy stocks that are at/below their minimum level or out of stock, with total counts and recent 30-day sales velocity.",
    permission: "reports.inventory",
    schema: z
      .object({ limit: z.number().int().min(1).max(50).default(20), only_out_of_stock: z.boolean().default(false) })
      .strict(),
    parameters: objectParams({
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Max rows returned (default 20). Totals are always complete." },
      only_out_of_stock: { type: "boolean", description: "Only products with zero units." },
    }),
    run: (a: { limit: number; only_out_of_stock: boolean }) =>
      getLowStockProducts({ limit: a.limit, onlyOutOfStock: a.only_out_of_stock }),
  },
  {
    name: "get_expiring_batches",
    description:
      "Stock batches expiring within N days from today (optionally including already-expired ones), with summary counts, units and retail value.",
    permission: "reports.inventory",
    schema: z
      .object({
        within_days: z.number().int().min(0).max(1825).default(30),
        min_qty: z.number().int().min(1).optional(),
        include_expired: z.boolean().default(false),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .strict(),
    parameters: objectParams({
      within_days: { type: "integer", minimum: 0, maximum: 1825, description: "Days from today (default 30)." },
      min_qty: { type: "integer", minimum: 1, description: "Only batches with at least this many units." },
      include_expired: { type: "boolean", description: "Also include batches that already expired and still have stock." },
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Max rows (default 20). Summary is always complete." },
    }),
    run: (a: { within_days: number; min_qty?: number; include_expired: boolean; limit: number }) =>
      getExpiringBatches({ withinDays: a.within_days, minQty: a.min_qty, includeExpired: a.include_expired, limit: a.limit }),
  },
  {
    name: "get_inventory_movements",
    description: "Stock movements (receive, sale, return, adjustment) in a date range with totals per type and the most recent entries.",
    permission: "reports.inventory",
    schema: dateRangeSchema.extend({
      movement_type: z.enum(["receive", "sale", "return", "adjustment"]).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    parameters: objectParams({
      ...dateRangeParams,
      movement_type: { type: "string", enum: ["receive", "sale", "return", "adjustment"] },
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Max rows (default 20)." },
    }),
    run: (a: { from?: string; to?: string; movement_type?: "receive" | "sale" | "return" | "adjustment"; limit: number }) =>
      getInventoryMovements({ ...resolveRange(a.from, a.to), movementType: a.movement_type, limit: a.limit }),
  },
  {
    name: "search_products",
    description: "Look up products by name, brand or exact barcode. Returns stock on hand, price, minimum level and nearest expiry.",
    permission: "products.view",
    schema: z.object({ query: z.string().trim().min(2).max(100), limit: z.number().int().min(1).max(20).default(10) }).strict(),
    parameters: objectParams(
      {
        query: { type: "string", description: "Product name, brand or barcode (min 2 characters)." },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      ["query"],
    ),
    run: (a: { query: string; limit: number }) => ({ query: a.query, products: searchStock(a.query, a.limit) }),
  },
  {
    name: "get_profit_summary",
    description:
      "Gross profit and margin for a date range, based on recorded batch purchase costs. Reports cost coverage when some batches have no cost.",
    permission: "reports.profit",
    schema: dateRangeSchema,
    parameters: objectParams(dateRangeParams),
    run: (a: z.infer<typeof dateRangeSchema>) => getProfitSummary(resolveRange(a.from, a.to)),
  },
  {
    name: "get_inventory_valuation",
    description: "Current stock value at cost and at retail price, with units and batch counts.",
    permission: "reports.profit",
    schema: z.object({}).strict(),
    parameters: objectParams({}),
    run: () => getInventoryValuation(),
  },
  {
    name: "get_cash_shifts",
    description:
      "Recent cash-drawer shifts: who opened/closed them, sales count, expected vs counted cash in USD and LBP, and the difference (variance). Newest first.",
    permission: "cash.reconcile",
    schema: z.object({ limit: z.number().int().min(1).max(30).default(10) }).strict(),
    parameters: objectParams({ limit: { type: "integer", minimum: 1, maximum: 30, description: "Number of shifts (default 10)." } }),
    run: (a: { limit: number }) => ({
      shifts: listShifts(a.limit).map((s) => ({
        id: s.id,
        status: s.status,
        opened_at_utc: s.opened_at,
        opened_by: s.opened_by_name,
        closed_at_utc: s.closed_at,
        closed_by: s.closed_by_name,
        sale_count: s.totals.sale_count,
        net_sales_usd: s.totals.net_sales_usd,
        expected_usd: s.totals.expected_usd,
        expected_lbp: s.totals.expected_lbp,
        counted_usd: s.counted_usd,
        counted_lbp: s.counted_lbp,
        variance_usd: s.variance_usd,
        variance_lbp: s.variance_lbp,
      })),
    }),
  },
];

const byName = new Map(AI_TOOLS.map((t) => [t.name, t]));

export function toolSpecsForRole(role: Role): ToolSpec[] {
  return AI_TOOLS.filter((t) => hasPermission(role, t.permission)).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function deniedToolsForRole(role: Role) {
  return AI_TOOLS.filter((t) => !hasPermission(role, t.permission)).map((t) => ({
    name: t.name,
    description: t.description,
    allowed_roles: rolesWithPermission(t.permission),
  }));
}

export type ToolExecution = {
  name: string;
  arguments: Record<string, unknown>;
  status: "ok" | "invalid_arguments" | "permission_denied" | "unknown_tool" | "error";
  result: unknown;
  error?: string;
  duration_ms: number;
};

const MAX_RESULT_CHARS = 20_000;

/** Validates, authorises and runs one tool call. Never throws; failures are returned to the model. */
export function executeTool(name: string, rawArguments: string, role: Role): ToolExecution {
  const started = Date.now();
  const done = (partial: Omit<ToolExecution, "name" | "duration_ms">): ToolExecution => ({
    name,
    ...partial,
    duration_ms: Date.now() - started,
  });

  let args: Record<string, unknown> = {};
  try {
    args = rawArguments?.trim() ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return done({ arguments: {}, status: "invalid_arguments", result: null, error: "Arguments were not valid JSON" });
  }

  const tool = byName.get(name);
  if (!tool) {
    return done({ arguments: args, status: "unknown_tool", result: null, error: `No tool named ${name}` });
  }
  if (!hasPermission(role, tool.permission)) {
    return done({
      arguments: args,
      status: "permission_denied",
      result: null,
      error: `The user's role (${role}) is not allowed to access this data. Allowed roles: ${rolesWithPermission(tool.permission).join(", ")}.`,
    });
  }

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return done({
      arguments: args,
      status: "invalid_arguments",
      result: null,
      error: `${issue?.path.join(".") || "arguments"}: ${issue?.message ?? "invalid"}`,
    });
  }

  try {
    const result = tool.run(parsed.data);
    if (JSON.stringify(result).length > MAX_RESULT_CHARS) {
      return done({ arguments: args, status: "error", result: null, error: "Result too large. Use a smaller limit or date range." });
    }
    return done({ arguments: args, status: "ok", result });
  } catch (error) {
    if (error instanceof RangeError || error instanceof BusinessError) {
      return done({ arguments: args, status: "invalid_arguments", result: null, error: error.message });
    }
    console.error(`AI tool ${name} failed:`, error);
    return done({ arguments: args, status: "error", result: null, error: "Internal error while reading data" });
  }
}
