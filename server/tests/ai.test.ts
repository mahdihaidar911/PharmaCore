import { isoDaysFromToday, startServer, type TestServer } from "./helpers.js";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import {
  AiProviderError,
  setProviderOverride,
  type ChatProvider,
  type CompletionRequest,
  type CompletionResult,
} from "../src/ai/provider.js";

class ScriptedProvider implements ChatProvider {
  readonly model = "fake-model";
  readonly requests: CompletionRequest[] = [];
  constructor(private readonly script: (request: CompletionRequest, index: number) => CompletionResult) {}
  async complete(request: CompletionRequest) {
    this.requests.push(structuredClone(request));
    return this.script(request, this.requests.length - 1);
  }
}

let callSeq = 0;
const toolCall = (name: string, args: Record<string, unknown>) => ({
  id: `call_${++callSeq}`,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});
const answer = (content: string): CompletionResult => ({ content, toolCalls: [] });
const ask = (content: string) => ({ messages: [{ role: "user", content }] });

let s: TestServer;
let cashier: { token: string };
let expiringBatchId: number;

before(async () => {
  s = await startServer();
  cashier = await s.createUser("cashier");
  expiringBatchId = (await s.receiveProduct({ name: "Amoxicillin 500", price: 4, qty: 25, expiry: isoDaysFromToday(12) })).batch_id;
});
afterEach(() => setProviderOverride(undefined));
after(() => s.close());

describe("assistant availability", () => {
  test("returns 503 with configured:false when no model is configured", async () => {
    setProviderOverride(null);
    const status = await s.call("GET", "/api/ai/status", { token: s.ownerToken });
    assert.equal(status.body.configured, false);

    const res = await s.call("POST", "/api/ai/chat", { token: s.ownerToken, body: ask("What expires soon?") });
    assert.equal(res.status, 503);
    assert.equal(res.body.configured, false);
  });

  test("surfaces provider failures as 502 with a readable message", async () => {
    setProviderOverride({
      model: "broken",
      complete: async () => {
        throw new AiProviderError("The AI API key was rejected.");
      },
    });
    const res = await s.call("POST", "/api/ai/chat", { token: s.ownerToken, body: ask("hello") });
    assert.equal(res.status, 502);
    assert.equal(res.body.error, "The AI API key was rejected.");
  });

  test("validates the conversation payload", async () => {
    const res = await s.call("POST", "/api/ai/chat", {
      token: s.ownerToken,
      body: { messages: [{ role: "assistant", content: "hi" }] },
    });
    assert.equal(res.status, 400);
  });
});

describe("grounded tool calling", () => {
  test("executes the requested tool and feeds real data back to the model", async () => {
    const provider = new ScriptedProvider((request, i) => {
      if (i === 0) return { content: null, toolCalls: [toolCall("get_expiring_batches", { within_days: 30 })] };
      const toolMessage = request.messages.at(-1) as { role: string; content: string };
      const data = JSON.parse(toolMessage.content);
      return answer(`${data.summary.batch_count} batch(es) expire within 30 days.`);
    });
    setProviderOverride(provider);

    const res = await s.call("POST", "/api/ai/chat", { token: s.ownerToken, body: ask("What expires this month?") });
    assert.equal(res.status, 200);
    assert.equal(res.body.grounded, true);
    assert.equal(res.body.tool_calls[0].name, "get_expiring_batches");
    assert.equal(res.body.tool_calls[0].status, "ok");
    assert.match(res.body.answer, /^1 batch\(es\)/);

    const toolResult = JSON.parse((provider.requests[1].messages.at(-1) as { content: string }).content);
    assert.equal(toolResult.batches[0].batch_id, expiringBatchId);

    const system = provider.requests[0].messages[0] as { role: string; content: string };
    assert.equal(system.role, "system");
    assert.match(system.content, new RegExp(isoDaysFromToday(0)));
    assert.match(system.content, /Never estimate, guess or invent data/);
    assert.match(system.content, /clinical or medical advice/);
  });

  test("flags answers that did not use any data", async () => {
    setProviderOverride(new ScriptedProvider(() => answer("Hello! How can I help?")));
    const res = await s.call("POST", "/api/ai/chat", { token: s.ownerToken, body: ask("hi") });
    assert.equal(res.body.grounded, false);
    assert.deepEqual(res.body.tool_calls, []);
  });

  test("returns validation errors to the model instead of running the tool", async () => {
    const provider = new ScriptedProvider((_r, i) =>
      i === 0 ? { content: null, toolCalls: [toolCall("get_top_products", { limit: 1000 })] } : answer("Could not run that."),
    );
    setProviderOverride(provider);
    const res = await s.call("POST", "/api/ai/chat", { token: s.ownerToken, body: ask("top 1000 products") });
    assert.equal(res.body.tool_calls[0].status, "invalid_arguments");
    assert.equal(res.body.grounded, false);
  });

  test("handles unknown tools safely", async () => {
    const provider = new ScriptedProvider((_r, i) =>
      i === 0 ? { content: null, toolCalls: [toolCall("drop_database", {})] } : answer("I can't do that."),
    );
    setProviderOverride(provider);
    const res = await s.call("POST", "/api/ai/chat", { token: s.ownerToken, body: ask("delete everything") });
    assert.equal(res.body.tool_calls[0].status, "unknown_tool");
  });

  test("stops runaway tool loops and forces a final answer", async () => {
    const provider = new ScriptedProvider((request) =>
      request.toolChoice === "none"
        ? answer("Here is what I found.")
        : { content: null, toolCalls: [toolCall("get_low_stock_products", {})] },
    );
    setProviderOverride(provider);
    const res = await s.call("POST", "/api/ai/chat", { token: s.ownerToken, body: ask("loop") });
    assert.equal(res.status, 200);
    assert.equal(res.body.answer, "Here is what I found.");
    assert.equal(provider.requests.length, 6, "5 tool rounds + 1 forced answer");
    assert.equal(provider.requests.at(-1)!.toolChoice, "none");
  });
});

describe("permission-aware assistant", () => {
  test("cashiers are not offered revenue tools and the prompt explains the restriction", async () => {
    const provider = new ScriptedProvider(() => answer("Your role does not have access to revenue."));
    setProviderOverride(provider);
    await s.call("POST", "/api/ai/chat", { token: cashier.token, body: ask("Show me company revenue for this year") });

    const offered = provider.requests[0].tools!.map((t) => t.function.name);
    assert.ok(!offered.includes("get_sales_summary"));
    assert.ok(!offered.includes("get_profit_summary"));
    assert.ok(offered.includes("get_expiring_batches"));
    const system = (provider.requests[0].messages[0] as { content: string }).content;
    assert.match(system, /get_sales_summary: .*allowed for: owner, pharmacist/);
  });

  test("blocks a restricted tool even if the model calls it anyway", async () => {
    const provider = new ScriptedProvider((_r, i) =>
      i === 0 ? { content: null, toolCalls: [toolCall("get_sales_summary", {})] } : answer("You do not have permission."),
    );
    setProviderOverride(provider);
    const res = await s.call("POST", "/api/ai/chat", { token: cashier.token, body: ask("revenue?") });
    assert.equal(res.body.permission_denied, true);
    assert.equal(res.body.tool_calls[0].status, "permission_denied");
    const toolMessage = JSON.parse((provider.requests[1].messages.at(-1) as { content: string }).content);
    assert.equal(toolMessage.status, "permission_denied");
    assert.equal(toolMessage.net_revenue_usd, undefined, "no revenue data leaked");
  });

  test("owners are offered profit tools", async () => {
    const provider = new ScriptedProvider(() => answer("ok"));
    setProviderOverride(provider);
    await s.call("POST", "/api/ai/chat", { token: s.ownerToken, body: ask("profit?") });
    assert.ok(provider.requests[0].tools!.some((t) => t.function.name === "get_profit_summary"));
  });
});

describe("analyze business", () => {
  test("works without AI using deterministic highlights", async () => {
    setProviderOverride(null);
    const res = await s.call("POST", "/api/ai/analyze", { token: s.ownerToken, body: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.ai_used, false);
    assert.equal(res.body.narrative, null);
    assert.ok(res.body.highlights.some((h: { title: string }) => /expire within 30 days/.test(h.title)));
    assert.ok(res.body.snapshot.sales);
    assert.ok(res.body.snapshot.profit);
  });

  test("snapshot for cashiers excludes sales and profit, including what is sent to the model", async () => {
    const provider = new ScriptedProvider(() => answer("### Business summary\nStock is fine."));
    setProviderOverride(provider);
    const res = await s.call("POST", "/api/ai/analyze", { token: cashier.token, body: {} });
    assert.equal(res.body.ai_used, true);
    assert.equal(res.body.snapshot.sales, undefined);
    assert.equal(res.body.snapshot.profit, undefined);
    const sent = JSON.parse((provider.requests[0].messages[1] as { content: string }).content);
    assert.equal(sent.snapshot.sales, undefined);
  });

  test("still returns data when the AI narrative fails", async () => {
    setProviderOverride({
      model: "broken",
      complete: async () => {
        throw new AiProviderError("timeout");
      },
    });
    const res = await s.call("POST", "/api/ai/analyze", { token: s.ownerToken, body: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.ai_error, "timeout");
    assert.ok(res.body.highlights.length > 0);
  });
});

describe("natural-language search", () => {
  const intent = (args: Record<string, unknown>) =>
    new ScriptedProvider(() => ({ content: null, toolCalls: [toolCall("run_structured_query", args)] }));

  test("translates to a validated structured query and runs it", async () => {
    const provider = intent({
      entity: "batches",
      filters: { expires_within_days: 60, min_qty: 11, cashier: "ignored-for-batches" },
      explanation: "Batches expiring in 60 days with more than 10 units",
    });
    setProviderOverride(provider);
    const res = await s.call("POST", "/api/ai/search", {
      token: s.ownerToken,
      body: { query: "products that expire in the next 60 days and have more than 10 units" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.entity, "batches");
    assert.ok(res.body.rows.some((r: { batch_id: number }) => r.batch_id === expiringBatchId));
    assert.deepEqual(res.body.query.filters, { expires_within_days: 60, min_qty: 11 });
    assert.deepEqual(provider.requests[0].toolChoice, { type: "function", function: { name: "run_structured_query" } });
  });

  test("rejects invalid filter values from the model", async () => {
    setProviderOverride(intent({ entity: "batches", filters: { min_qty: -5 }, explanation: "x" }));
    const res = await s.call("POST", "/api/ai/search", { token: s.ownerToken, body: { query: "negative stock" } });
    assert.equal(res.status, 422);
  });

  test("enforces permissions on the interpreted entity", async () => {
    setProviderOverride(intent({ entity: "sales", filters: { min_total_usd: 500 }, explanation: "Sales over $500" }));
    const res = await s.call("POST", "/api/ai/search", { token: cashier.token, body: { query: "sales over $500 last month" } });
    assert.equal(res.status, 403);
  });
});

describe("AI audit log", () => {
  test("records requests with tool calls; only owners can read it", async () => {
    assert.equal((await s.call("GET", "/api/ai/logs", { token: cashier.token })).status, 403);
    const logs = await s.call("GET", "/api/ai/logs?limit=200", { token: s.ownerToken });
    assert.equal(logs.status, 200);
    const kinds = new Set(logs.body.map((l: { kind: string }) => l.kind));
    assert.ok(kinds.has("chat") && kinds.has("analyze") && kinds.has("search"));
    const withTools = logs.body.find((l: { tool_calls: { name: string }[] }) => l.tool_calls.some((t) => t.name === "get_expiring_batches"));
    assert.ok(withTools, "tool calls are logged");
    assert.ok(logs.body.some((l: { status: string }) => l.status === "unconfigured"));
  });
});
