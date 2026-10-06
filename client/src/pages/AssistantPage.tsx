import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnalyzePanel } from "../components/assistant/AnalyzePanel";
import { ChatPanel } from "../components/assistant/ChatPanel";
import { SmartSearchPanel } from "../components/assistant/SmartSearchPanel";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui";
import { api, type AiStatus } from "../lib/api";

const TABS = [
  { id: "ask", label: "Ask" },
  { id: "analyze", label: "Analyze business" },
  { id: "search", label: "Smart search" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AssistantPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "ask") as TabId;
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    api.aiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const configured = Boolean(status?.configured);

  return (
    <PageShell
      title="AI assistant"
      description="Ask questions about sales, stock and expiry. Answers come only from PharmaCore data you are allowed to see."
      actions={
        status ? (
          configured ? (
            <Badge tone="success">Model: {status.model}</Badge>
          ) : (
            <Badge tone="warning">AI model not configured</Badge>
          )
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 gap-1 self-start rounded-xl bg-slate-200/70 p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? "tab-active" : ""}`}
              onClick={() => setParams(t.id === "ask" ? {} : { tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "ask" ? <ChatPanel configured={configured} /> : null}
        {tab === "analyze" ? <AnalyzePanel /> : null}
        {tab === "search" ? <SmartSearchPanel configured={configured} /> : null}
      </div>
    </PageShell>
  );
}
