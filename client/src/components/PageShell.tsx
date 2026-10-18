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
      <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="meta mb-1">{eyebrow}</p> : null}
          <h1 className="text-title font-semibold tracking-[-0.02em] text-fg">{title}</h1>
          {description ? <div className="mt-1 max-w-3xl text-dense text-fg-3">{description}</div> : null}
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

/** Section heading: label, optional count, a hairline running to the optional action. */
export function SectionHead({ title, count, action, id }: { title: string; count?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="section-head">
      <h2 id={id} className="flex min-w-0 items-baseline gap-2 text-dense font-semibold text-fg">
        {title}
        {count !== undefined ? <span className="font-mono text-xs font-medium text-fg-3">{count}</span> : null}
      </h2>
      <span className="h-px min-w-4 flex-1 bg-line" aria-hidden />
      {action}
    </div>
  );
}
