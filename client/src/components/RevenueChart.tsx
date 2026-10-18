import { useEffect, useRef, useState } from "react";
import { formatUsd } from "../lib/api";

type Day = { date: string; sale_count: number; net_revenue_usd: number };

const H = 160;
const PAD_TOP = 8;
const PAD_BOTTOM = 22;

function niceMax(value: number) {
  if (value <= 0) return 10;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * exp >= value) ?? 10;
  return step * exp;
}

function dayLabel(date: string, long = false) {
  const d = new Date(`${date}T12:00:00`);
  return long
    ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Daily net revenue as columns. The readout above the plot names the hovered (or latest) day,
 * and a visually hidden table carries the same figures for screen readers.
 */
export function RevenueChart({ days, today }: { days: Day[]; today?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setPlotWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [days.length]);
  if (days.length === 0) return null;

  const max = niceMax(Math.max(...days.map((d) => d.net_revenue_usd)));
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const slot = 100 / days.length;
  const barW = Math.min(slot * 0.6, 4.5);
  const labelsThatFit = plotWidth ? Math.max(2, Math.floor((plotWidth - 56) / 52)) : 7;
  const labelEvery = Math.ceil(days.length / Math.min(7, labelsThatFit));
  const shown = hover ?? days.length - 1;
  const focus = days[shown];
  const total = days.reduce((s, d) => s + d.net_revenue_usd, 0);

  return (
    <figure className="m-0">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-dense">
        <p className="min-w-0 truncate">
          <span className="text-fg-3">{dayLabel(focus.date, true)}</span>{" "}
          <span className="font-semibold text-fg">{formatUsd(focus.net_revenue_usd)}</span>{" "}
          <span className="text-fg-3">
            · {focus.sale_count} sale{focus.sale_count === 1 ? "" : "s"}
          </span>
        </p>
        <p className="shrink-0 text-fg-3">
          Period <span className="font-medium text-fg">{formatUsd(total)}</span>
        </p>
      </div>
      <div ref={plotRef} className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => (
          <div key={t} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ top: PAD_TOP + plotH * (1 - t) - 7 }}>
            <span className="h-px flex-1 bg-line" style={t === 0 ? { backgroundColor: "var(--c-line-strong)" } : undefined} />
            <span className="code w-12 text-right text-2xs text-fg-4">{t === 0 ? "" : formatUsd(max * t).replace(".00", "")}</span>
          </div>
        ))}
        <svg className="absolute inset-y-0 left-0" style={{ width: "calc(100% - 56px)" }} height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
          {days.map((d, i) => {
            const h = d.net_revenue_usd > 0 ? Math.max(1.5, (d.net_revenue_usd / max) * plotH) : 0;
            const x = i * slot + (slot - barW) / 2;
            const active = shown === i;
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)}>
                <rect x={i * slot} y={0} width={slot} height={H - PAD_BOTTOM} fill="transparent" />
                {h > 0 ? (
                  <rect
                    x={x}
                    y={PAD_TOP + plotH - h}
                    width={barW}
                    height={h}
                    fill={active ? "var(--c-accent)" : d.date === today ? "var(--c-accent)" : "var(--c-accent-line)"}
                  />
                ) : (
                  <rect x={x} y={PAD_TOP + plotH - 1} width={barW} height={1} fill="var(--c-line-strong)" />
                )}
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex" style={{ right: 56 }}>
          {days.map((d, i) => (
            <span key={d.date} className={`code flex min-w-0 flex-1 overflow-visible text-2xs whitespace-nowrap ${i === 0 ? "justify-start" : "justify-center"} ${shown === i ? "text-fg" : "text-fg-4"}`}>
              {shown === i || (i % labelEvery === 0 && Math.abs(i - shown) >= labelEvery) ? dayLabel(d.date) : ""}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Net revenue per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Sales</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.sale_count}</td>
              <td>{formatUsd(d.net_revenue_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
