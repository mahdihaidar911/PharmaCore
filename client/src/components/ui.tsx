import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type Tone = "info" | "success" | "warning" | "error";

const ALERT_ICON: Record<Tone, IconName> = { info: "info", success: "check", warning: "alert", error: "alert" };

export function Alert({ tone = "info", title, children, className = "" }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`alert alert-${tone} ${className}`.trim()}>
      <Icon name={ALERT_ICON[tone]} className="mt-px h-4 w-4" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}

/** A tag for record kinds and roles. For states (expired, low, open) use Status. */
export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "brand" | "success" | "warning" | "danger"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

type StatusTone = "ok" | "caution" | "danger" | "muted";
const STATUS_ICON: Record<StatusTone, IconName | null> = { ok: "check", caution: "clock", danger: "alert", muted: null };

/** A state written as icon + word. Colour reinforces the word; it never carries the meaning alone. */
export function Status({ tone, icon, children, className = "" }: { tone: StatusTone; icon?: IconName | null; children: ReactNode; className?: string }) {
  const glyph = icon === undefined ? STATUS_ICON[tone] : icon;
  return (
    <span className={`status status-${tone} ${className}`.trim()}>
      {glyph ? <Icon name={glyph} className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

export function Spinner({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm text-fg-3 ${className}`.trim()} role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-fg-2 motion-reduce:animate-none" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="px-4 py-8">
      {icon ? <Icon name={icon} className="mb-2 h-5 w-5 text-fg-4" /> : null}
      <p className="font-medium text-fg-2">{title}</p>
      {description ? <p className="mt-1 max-w-md text-dense text-fg-3">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * One readout in an instrument strip: label, figure, hint. Only meaningful inside FigureRow, which supplies
 * the shared surface and hairline dividers — figures are never boxed as separate cards.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const valueColor = { neutral: "text-fg", success: "text-accent-text", warning: "text-caution", danger: "text-danger" }[tone];
  const flag = tone === "warning" || tone === "danger" ? <Icon name="alert" className={`h-3.5 w-3.5 ${valueColor}`} /> : null;
  return (
    <div className="min-w-0 bg-surface px-4 py-3">
      <p className="kicker flex items-center gap-1.5">
        {label}
        {flag}
      </p>
      <p className={`mt-1.5 text-figure font-semibold tracking-[-0.02em] ${valueColor}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-3">{hint}</p> : null}
    </div>
  );
}

/** An instrument strip: StatCards share one surface, separated by hairlines. */
export function FigureRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-px overflow-hidden rounded-md border border-line bg-line shadow-raised sm:grid-cols-2 xl:grid-cols-4 ${className}`.trim()}>
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-danger">
          <Icon name="alert" className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </label>
  );
}

/** Text search with a leading icon; used for every list filter so they look and behave the same. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`.trim()}>
      <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-3" />
      <input
        type="search"
        aria-label={label}
        className="input pl-8"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const initial =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel?.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE);
    initial?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (returnTo && document.contains(returnTo)) returnTo.focus();
    };
  }, [open]);

  if (!open) return null;
  const width = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-3xl" }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full ${width} animate-enter flex-col overflow-hidden rounded-t-lg border border-line-strong bg-surface text-fg shadow-overlay sm:rounded-lg`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-fg">{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm btn-icon -mr-2" onClick={onClose} aria-label="Close">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} data-autofocus={destructive ? true : undefined}>
            Cancel
          </button>
          <button
            type="button"
            data-autofocus={destructive ? undefined : true}
            className={`btn ${destructive ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-fg-2">{message}</div>
    </Modal>
  );
}

export function NoAccess({ what = "this page" }: { what?: string }) {
  return (
    <div className="flex h-full items-start justify-center pt-16">
      <div className="sheet max-w-md p-6">
        <p className="flex items-center gap-2 text-lg font-semibold text-fg">
          <Icon name="alert" className="h-5 w-5 text-caution" />
          No access
        </p>
        <p className="mt-2 text-sm text-fg-2">
          Your role does not have permission to open {what}. Ask the pharmacy owner if you need access.
        </p>
      </div>
    </div>
  );
}
