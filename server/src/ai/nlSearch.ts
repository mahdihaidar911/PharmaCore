import { hasPermission } from "../auth/permissions.js";
import {
  batchFiltersSchema,
  ENTITY_PERMISSION,
  productFiltersSchema,
  runStructuredQuery,
  saleFiltersSchema,
  structuredQuerySchema,
  type StructuredQueryResult,
} from "../services/structuredQuery.js";
import { logAiRequest } from "./log.js";
import { AiUnavailableError, requireProvider, type AiUser } from "./orchestrator.js";
import { SEARCH_SYSTEM_PROMPT } from "./prompts.js";
import type { ToolSpec } from "./provider.js";

/** Raised when the model's output cannot be turned into a valid, permitted query. */
export class SearchIntentError extends Error {
  constructor(
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "SearchIntentError";
  }
}

const FIELDS_BY_ENTITY = {
  batches: Object.keys(batchFiltersSchema.shape),
  products: Object.keys(productFiltersSchema.shape),
  sales: Object.keys(saleFiltersSchema.shape),
} as const;

const STRUCTURED_QUERY_TOOL: ToolSpec = {
  type: "function",
  function: {
    name: "run_structured_query",
    description: "Run a filtered list query against PharmaCore data.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["entity", "filters", "explanation"],
      properties: {
        entity: { type: "string", enum: ["batches", "products", "sales"] },
        explanation: { type: "string", description: "One short sentence describing how the request was interpreted." },
        filters: {
          type: "object",
          additionalProperties: false,
          description: "Only include filters the request implies. Fields apply to the entity named in the comment.",
          properties: {
            product_name: { type: "string", description: "batches: product name contains" },
            expires_within_days: { type: "integer", minimum: 0, description: "batches: expiring between today and N days from now" },
            expired_only: { type: "boolean", description: "batches: only already-expired batches" },
            min_qty: { type: "integer", minimum: 0, description: "batches: batch qty ≥; products: total stock ≥" },
            max_qty: { type: "integer", minimum: 0, description: "batches: batch qty ≤; products: total stock ≤" },
            name_contains: { type: "string", description: "products: name or brand contains" },
            category: { type: "string", description: "products: category contains" },
            stock_status: { type: "string", enum: ["any", "in_stock", "low", "out_of_stock"], description: "products" },
            min_price_usd: { type: "number", minimum: 0, description: "products: price ≥" },
            max_price_usd: { type: "number", minimum: 0, description: "products: price ≤" },
            from: { type: "string", description: "sales: start date YYYY-MM-DD" },
            to: { type: "string", description: "sales: end date YYYY-MM-DD" },
            min_total_usd: { type: "number", minimum: 0, description: "sales: invoice total ≥" },
            max_total_usd: { type: "number", minimum: 0, description: "sales: invoice total ≤" },
            payment_method: { type: "string", enum: ["cash", "card", "mixed"], description: "sales" },
            cashier: { type: "string", description: "sales: cashier username" },
          },
        },
      },
    },
  },
};

export type NaturalLanguageSearchResult = StructuredQueryResult & {
  interpretation: string;
  query: unknown;
  model: string;
};

export async function naturalLanguageSearch(user: AiUser, text: string): Promise<NaturalLanguageSearchResult> {
  const started = Date.now();
  let model: string | null = null;
  let intent: unknown = null;

  try {
    const provider = requireProvider();
    model = provider.model;
    const completion = await provider.complete({
      messages: [
        { role: "system", content: SEARCH_SYSTEM_PROMPT() },
        { role: "user", content: text },
      ],
      tools: [STRUCTURED_QUERY_TOOL],
      toolChoice: { type: "function", function: { name: "run_structured_query" } },
      temperature: 0,
    });

    const call = completion.toolCalls.find((c) => c.function.name === "run_structured_query");
    if (!call) {
      throw new SearchIntentError("I couldn't turn that into a search. Try something like “products with less than 5 units”.");
    }

    let raw: { entity?: string; filters?: Record<string, unknown>; explanation?: string };
    try {
      raw = JSON.parse(call.function.arguments || "{}");
    } catch {
      throw new SearchIntentError("The AI returned an unreadable query. Please rephrase.");
    }
    intent = raw;

    const entity = raw.entity as keyof typeof FIELDS_BY_ENTITY;
    if (!(entity in FIELDS_BY_ENTITY)) {
      throw new SearchIntentError("I couldn't tell whether you meant products, stock batches or sales. Please rephrase.");
    }
    // Drop filters that belong to other entities, then validate strictly.
    const allowed = new Set<string>(FIELDS_BY_ENTITY[entity]);
    const filters = Object.fromEntries(
      Object.entries(raw.filters ?? {}).filter(([key, value]) => allowed.has(key) && value !== null && value !== ""),
    );
    const parsed = structuredQuerySchema.safeParse({ entity, filters, limit: 100 });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new SearchIntentError(`The interpreted query was invalid (${issue?.path.join(".")}: ${issue?.message}). Please rephrase.`);
    }

    if (!hasPermission(user.role, ENTITY_PERMISSION[parsed.data.entity])) {
      throw new SearchIntentError(`Your role (${user.role}) does not have access to ${parsed.data.entity} data.`, 403);
    }

    const result = runStructuredQuery(parsed.data);
    const interpretation = typeof raw.explanation === "string" ? raw.explanation.slice(0, 300) : "";

    logAiRequest({
      userId: user.userId,
      kind: "search",
      prompt: text,
      response: JSON.stringify({ query: parsed.data, total: result.total }),
      model,
      status: "ok",
      latencyMs: Date.now() - started,
    });
    return { ...result, interpretation, query: parsed.data, model: provider.model };
  } catch (error) {
    logAiRequest({
      userId: user.userId,
      kind: "search",
      prompt: text,
      response: intent ? JSON.stringify(intent) : null,
      model,
      status: error instanceof SearchIntentError ? "rejected" : error instanceof AiUnavailableError ? "unconfigured" : "error",
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    });
    throw error;
  }
}
