import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Extra header row (filters, actions) — stays fixed, does not scroll */
  actions?: ReactNode;
};

/** Fills the main area; only inner ScrollBox/Panel regions scroll. */
export function PageShell({ title, description, children, actions }: PageShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            {description ? <div className="mt-1 max-w-3xl text-sm text-slate-500">{description}</div> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
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

/** Card with optional internal scroll via nested ScrollBox. */
export function Panel({ children, className = "", padding = true }: PanelProps) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${
        padding ? "p-5" : ""
      } ${className}`.trim()}
    >
      {children}
    </div>
  );
}
