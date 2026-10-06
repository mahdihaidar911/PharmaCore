import type { Role } from "../auth/permissions.js";
import { config } from "../config.js";
import { logAiRequest } from "./log.js";
import { assistantSystemPrompt } from "./prompts.js";
import { AiProviderError, getProvider, type ChatMessage, type ChatProvider } from "./provider.js";
import { executeTool, toolSpecsForRole, type ToolExecution } from "./tools.js";

export class AiUnavailableError extends Error {
  constructor() {
    super("The AI assistant is not configured on this server. Ask the owner to set AI_MODEL and AI_API_KEY (or a local model URL).");
    this.name = "AiUnavailableError";
  }
}

export type AiUser = { userId: number; username: string; role: Role };
export type ConversationTurn = { role: "user" | "assistant"; content: string };

export type ToolCallSummary = {
  name: string;
  arguments: Record<string, unknown>;
  status: ToolExecution["status"];
  error?: string;
  duration_ms: number;
};

export type AssistantReply = {
  answer: string;
  tool_calls: ToolCallSummary[];
  /** True when at least one tool returned data that the answer could be based on. */
  grounded: boolean;
  permission_denied: boolean;
  model: string;
};

export function requireProvider(): ChatProvider {
  const provider = getProvider();
  if (!provider) throw new AiUnavailableError();
  return provider;
}

const summarize = (t: ToolExecution): ToolCallSummary => ({
  name: t.name,
  arguments: t.arguments,
  status: t.status,
  ...(t.error ? { error: t.error } : {}),
  duration_ms: t.duration_ms,
});

/**
 * Tool-calling loop: the model may request tools, PharmaCore executes them with the caller's
 * permissions, results go back to the model, until it produces a final answer.
 */
export async function runAssistantChat(user: AiUser, history: ConversationTurn[]): Promise<AssistantReply> {
  const started = Date.now();
  const question = history[history.length - 1]?.content ?? "";
  const executions: ToolExecution[] = [];
  let provider: ChatProvider | null = null;

  try {
    provider = requireProvider();
    const tools = toolSpecsForRole(user.role);
    const messages: ChatMessage[] = [
      { role: "system", content: assistantSystemPrompt(user) },
      ...history.map((turn) => ({ role: turn.role, content: turn.content }) as ChatMessage),
    ];

    let answer: string | null = null;
    for (let round = 0; round < config.ai.maxToolRounds && answer === null; round++) {
      const result = await provider.complete({ messages, tools, toolChoice: "auto" });
      if (result.toolCalls.length === 0) {
        answer = result.content?.trim() || null;
        break;
      }

      messages.push({ role: "assistant", content: result.content, tool_calls: result.toolCalls });
      for (const call of result.toolCalls) {
        const execution = executeTool(call.function.name, call.function.arguments, user.role);
        executions.push(execution);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            execution.status === "ok" ? execution.result : { error: execution.error, status: execution.status },
          ),
        });
      }
    }

    if (answer === null) {
      const final = await provider.complete({
        messages: [
          ...messages,
          { role: "user", content: "Answer now using only the tool results above. If they are insufficient, say what is missing." },
        ],
        tools,
        toolChoice: "none",
      });
      answer = final.content?.trim() || "I could not produce an answer from the available data. Please rephrase the question.";
    }

    const reply: AssistantReply = {
      answer,
      tool_calls: executions.map(summarize),
      grounded: executions.some((e) => e.status === "ok"),
      permission_denied: executions.some((e) => e.status === "permission_denied"),
      model: provider.model,
    };

    logAiRequest({
      userId: user.userId,
      kind: "chat",
      prompt: question,
      response: answer,
      toolCalls: reply.tool_calls,
      model: provider.model,
      status: "ok",
      latencyMs: Date.now() - started,
    });
    return reply;
  } catch (error) {
    logAiRequest({
      userId: user.userId,
      kind: "chat",
      prompt: question,
      toolCalls: executions.map(summarize),
      model: provider?.model ?? null,
      status: error instanceof AiUnavailableError ? "unconfigured" : "error",
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    });
    if (error instanceof AiUnavailableError || error instanceof AiProviderError) throw error;
    console.error("AI chat failed:", error);
    throw new AiProviderError("The assistant failed unexpectedly. Please try again.");
  }
}
