import { config, isAiConfigured } from "../config.js";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolChoice = "auto" | "none" | { type: "function"; function: { name: string } };

export type CompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: ToolChoice;
  temperature?: number;
};

export type CompletionResult = { content: string | null; toolCalls: ToolCall[] };

export interface ChatProvider {
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** The model service failed (network, auth, quota, malformed reply). Safe to show to users. */
export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** Talks to any OpenAI-compatible `/chat/completions` endpoint (OpenAI, Ollama, LM Studio, gateways). */
export class OpenAICompatibleProvider implements ChatProvider {
  constructor(
    private readonly options: { baseUrl: string; apiKey: string; model: string; timeoutMs: number },
  ) {}

  get model() {
    return this.options.model;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: this.options.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
    };
    if (request.tools?.length) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice ?? "auto";
    }

    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new AiProviderError(
        timedOut ? "The AI service took too long to respond. Try again." : "Cannot reach the AI service. Check the internet connection or AI settings.",
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`AI provider HTTP ${response.status}: ${detail.slice(0, 500)}`);
      const reason =
        response.status === 401 || response.status === 403
          ? "The AI API key was rejected."
          : response.status === 429
            ? "The AI service rate limit or quota was reached."
            : `The AI service returned an error (HTTP ${response.status}).`;
      throw new AiProviderError(reason);
    }

    const data = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    } | null;
    const message = data?.choices?.[0]?.message;
    if (!message) {
      throw new AiProviderError("The AI service returned an empty response.");
    }
    return { content: message.content ?? null, toolCalls: message.tool_calls ?? [] };
  }
}

let providerOverride: ChatProvider | null | undefined;

/** Lets tests inject a scripted provider. Pass undefined to restore normal behaviour. */
export function setProviderOverride(provider: ChatProvider | null | undefined) {
  providerOverride = provider;
}

export function getProvider(): ChatProvider | null {
  if (providerOverride !== undefined) return providerOverride;
  if (!isAiConfigured()) return null;
  return new OpenAICompatibleProvider({
    baseUrl: config.ai.baseUrl,
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    timeoutMs: config.ai.timeoutMs,
  });
}
