import { db } from "../db/index.js";
import type { ToolExecution } from "./tools.js";

export type AiLogStatus = "ok" | "error" | "unconfigured" | "rejected";

const clip = (value: string | null | undefined, max = 8000) =>
  value == null ? null : value.length > max ? `${value.slice(0, max)}…` : value;

/** Every assistant request is recorded with the tools it called, for auditing and debugging. */
export function logAiRequest(entry: {
  userId: number;
  kind: "chat" | "analyze" | "search";
  prompt: string;
  response?: string | null;
  toolCalls?: Pick<ToolExecution, "name" | "arguments" | "status" | "error" | "duration_ms">[];
  model?: string | null;
  status: AiLogStatus;
  error?: string | null;
  latencyMs: number;
}) {
  try {
    db.prepare(`
      INSERT INTO ai_logs (user_id, kind, prompt, response, tool_calls, model, status, error, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.userId,
      entry.kind,
      clip(entry.prompt),
      clip(entry.response),
      entry.toolCalls ? JSON.stringify(entry.toolCalls) : null,
      entry.model ?? null,
      entry.status,
      clip(entry.error, 1000),
      entry.latencyMs,
    );
  } catch (error) {
    console.error("Failed to write AI log:", error);
  }
}
