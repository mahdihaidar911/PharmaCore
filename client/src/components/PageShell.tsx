import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Header actions (filters, primary action) — fixed, does not scroll */
  actions?: ReactNode;
  /** Small line above the title, e.g. the date or the record number */
  eyebrow?: ReactNode;
};

/** Fills the main area; only inner ScrollBox/Panel regions scroll. */
export function PageShell({ title, description, children, actions, eyebrow }: PageShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 border-b border-rule pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="meta mb-0.5">{eyebrow}</p> : null}
          <h1 className="font-serif text-title font-semibold text-ink">{title}</h1>
          {description ? <div className="mt-1 max-w-3xl text-dense text-ink-3">{description}</div> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

type ScrollBoxProps = {
  children: ReactNode;
  className?: string;
};

/** Scrollable region inside a page (tables, lists, long forms). */
export function ScrollBox({ children, className = "" }: ScrollBoxProps) {
  return <div className={`min-h-0 overflow-auto ${className}`.trim()}>{children}</div>;
}

type PanelProps = {
  children: ReactNode;
  className?: string;
  padding?: boolean;
};

/** A paper sheet with optional internal scroll via nested ScrollBox. Do not nest Panels. */
export function Panel({ children, className = "", padding = true }: PanelProps) {
  return <div className={`sheet flex min-h-0 flex-col overflow-hidden ${padding ? "p-5" : ""} ${className}`.trim()}>{children}</div>;
}

/** Section heading on the page: heavy ink rule, kicker label, optional count and action. */
export function SectionHead({ title, count, action, id }: { title: string; count?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="section-head">
      <h2 id={id} className="kicker flex items-baseline gap-2">
        {title}
        {count !== undefined ? <span className="font-mono text-xs font-medium tracking-normal text-ink-3 normal-case">{count}</span> : null}
      </h2>
      {action}
    </div>
  );
}
