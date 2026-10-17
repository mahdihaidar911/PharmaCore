import { FormEvent, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, type AiChatReply } from "../../lib/api";
import { SimpleMarkdown } from "../../lib/markdown";
import { Icon } from "../icons";
import { Alert, Badge, Spinner } from "../ui";
import { describeToolArgs, toolLabel } from "./toolLabels";

type Turn = { role: "user"; content: string } | { role: "assistant"; content: string; reply?: AiChatReply; failed?: boolean };

const SUGGESTIONS = [
  { text: "What products have batches expiring in the next 30 days?", needs: "reports.inventory" },
  { text: "Which stocked products are out of stock or below minimum?", needs: "reports.inventory" },
  { text: "Which products have been selling the fastest this month?", needs: "reports.sales" },
  { text: "How do this week's sales compare with last week?", needs: "reports.sales" },
  { text: "Why did sales change last week?", needs: "reports.sales" },
  { text: "What is our gross profit this month?", needs: "reports.profit" },
] as const;

export function ChatPanel({ configured }: { configured: boolean }) {
  const { can } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, sending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending) return;
    const history = [...turns, { role: "user" as const, content: question }];
    setTurns(history);
    setInput("");
    setSending(true);
    try {
      const messages = history
        .filter((t) => !(t.role === "assistant" && t.failed))
        .map((t) => ({ role: t.role, content: t.content }));
      const reply = await api.aiChat(messages);
      setTurns((prev) => [...prev, { role: "assistant", content: reply.answer, reply }]);
    } catch (err) {
      setTurns((prev) => [...prev, { role: "assistant", content: err instanceof Error ? err.message : "The assistant failed.", failed: true }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  const suggestions = SUGGESTIONS.filter((s) => can(s.needs));

  return (
    <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {!configured ? (
          <Alert tone="warning" title="AI model not configured">
            Chat needs an AI model. The owner can set <code>AI_MODEL</code> and <code>AI_API_KEY</code> (or a local Ollama / LM Studio URL in{" "}
            <code>AI_BASE_URL</code>) in the server's <code>.env</code> file. “Analyze business” still works without it.
          </Alert>
        ) : null}

        {turns.length === 0 ? (
          <div className="max-w-2xl py-2">
            <p className="text-lg font-semibold tracking-[-0.01em] text-fg">Ask about your pharmacy's data</p>
            <p className="mt-1 text-dense text-fg-3">
              Answers are calculated from PharmaCore's records. Each answer lists the data it used. This assistant does not give medical advice.
            </p>
            {suggestions.length > 0 ? (
              <>
                <p className="kicker mt-5">Try asking</p>
                <ul className="mt-1 border-t border-line">
                  {suggestions.map((s) => (
                    <li key={s.text} className="border-b border-line">
                      <button
                        type="button"
                        disabled={!configured || sending}
                        onClick={() => send(s.text)}
                        className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left text-dense text-fg-2 hover:bg-canvas hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {s.text}
                        <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-fg-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="max-w-3xl border-t border-line-strong pt-2">
              <p className="kicker">Question</p>
              <p className="mt-0.5 whitespace-pre-wrap font-medium text-fg">{turn.content}</p>
            </div>
          ) : (
            <AssistantMessage key={i} turn={turn} />
          ),
        )}

        {sending ? (
          <Spinner label="Checking PharmaCore data…" />
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="flex shrink-0 items-end gap-2 border-t border-line bg-canvas p-3">
        <textarea
          ref={inputRef}
          rows={1}
          className="input max-h-32 min-h-11 flex-1 resize-none"
          placeholder={configured ? "Ask a question… (Enter to send, Shift+Enter for a new line)" : "AI model not configured"}
          value={input}
          maxLength={1000}
          disabled={!configured}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {turns.length > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={() => setTurns([])} disabled={sending}>
            Clear
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={!configured || sending || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}

function AssistantMessage({ turn }: { turn: Extract<Turn, { role: "assistant" }> }) {
  if (turn.failed) {
    return (
      <div className="max-w-3xl">
        <Alert tone="error">{turn.content}</Alert>
      </div>
    );
  }
  const reply = turn.reply;
  const sources = reply?.tool_calls ?? [];

  return (
    <div className="max-w-3xl space-y-2 border-l-2 border-accent pl-4">
      <p className="kicker">Answer</p>
      <div className="text-fg">
        <SimpleMarkdown text={turn.content} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {sources.length > 0 ? <span className="text-fg-3">Sources:</span> : null}
        {sources.map((call, i) => (
          <span
            key={i}
            title={call.error ?? describeToolArgs(call)}
            className={`badge ${call.status === "ok" ? "badge-brand" : call.status === "permission_denied" ? "badge-danger" : "badge-warning"}`}
          >
            {toolLabel(call.name)}
            {describeToolArgs(call) ? <span className="font-normal opacity-75">· {describeToolArgs(call)}</span> : null}
            {call.status === "permission_denied" ? " · no access" : call.status !== "ok" ? " · failed" : ""}
          </span>
        ))}
        {reply && !reply.grounded ? <Badge tone="neutral">Not based on PharmaCore data</Badge> : null}
      </div>
    </div>
  );
}
