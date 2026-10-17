import { daysUntil, expiryStatus } from "../lib/expiry";
import { Status } from "./ui";

const METER_TONE = { danger: "meter-danger", caution: "meter-caution", muted: "meter-ok" } as const;

/** Expiry date, how it reads (expired / days left / months), and a meter of the next 12 months of shelf life. */
export function ExpiryCell({ date, meter = true }: { date: string; meter?: boolean }) {
  const days = daysUntil(date);
  const st = expiryStatus(days);
  const share = Math.max(0, Math.min(1, days / 365));
  return (
    <span className="block min-w-28">
      <span className="code block text-fg">{date}</span>
      <Status tone={st.tone} icon={st.tone === "muted" ? null : undefined} className="text-xs">
        {st.label}
      </Status>
      {meter ? (
        <span className={`meter mt-1 w-24 ${METER_TONE[st.tone]} ${days < 0 ? "bg-danger-bg" : ""}`} aria-hidden>
          <span style={{ width: `${Math.max(share * 100, days < 0 ? 0 : 3)}%` }} />
        </span>
      ) : null}
    </span>
  );
}
