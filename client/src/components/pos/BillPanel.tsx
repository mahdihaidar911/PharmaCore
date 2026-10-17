import type { FormEvent, RefObject } from "react";
import { Link } from "react-router-dom";
import { formatLbp, formatUsd, usdToLbp, type SaleDetail } from "../../lib/api";
import { Icon } from "../icons";
import { Status } from "../ui";

export type PaymentMethod = "cash" | "card" | "mixed";

const METHODS: { value: PaymentMethod; label: string; title: string }[] = [
  { value: "cash", label: "Cash", title: "Cash in USD or LBP" },
  { value: "card", label: "Card", title: "Card payment" },
  { value: "mixed", label: "Mixed", title: "Cash paid partly in USD and partly in LBP" },
];

type Change = { hasChange: boolean; changeUsd: number; changeLbp: number };

function TenderField({
  currency,
  value,
  step,
  onChange,
  onExact,
  shortcut,
  disabled,
}: {
  currency: "USD" | "LBP";
  value: string;
  step: string;
  onChange: (v: string) => void;
  onExact: () => void;
  shortcut: string;
  disabled: boolean;
}) {
  const id = `tender-${currency.toLowerCase()}`;
  return (
    <div className="flex items-stretch overflow-hidden rounded-sm border border-line-input/70 bg-surface focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--c-accent-soft)]">
      <label htmlFor={id} className="flex w-14 shrink-0 items-center justify-center border-r border-line font-mono text-xs font-medium text-fg-3">
        {currency}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={step}
        inputMode="decimal"
        placeholder="0"
        className="min-h-11 w-full min-w-0 bg-transparent px-3 text-right text-lg font-semibold text-fg placeholder:text-fg-4 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={onExact}
        disabled={disabled}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 border-l border-line px-2.5 text-dense font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
        title={`Customer pays the exact total in ${currency} (${shortcut})`}
      >
        Exact <span className="kbd">{shortcut}</span>
      </button>
    </div>
  );
}

/** The checkout instrument: always a graphite surface, in both themes. */
export function BillPanel({
  formRef,
  onSubmit,
  subtotalUsd,
  canDiscount,
  discountUsd,
  discountInvalid,
  onDiscount,
  totalUsd,
  totalLbp,
  rate,
  paymentMethod,
  onPaymentMethod,
  paidUsd,
  paidLbp,
  onPaidUsd,
  onPaidLbp,
  onExact,
  tendered,
  insufficient,
  dueUsd,
  change,
  checkoutError,
  checkingOut,
  cartEmpty,
  drawerOpen,
  lastSale,
  onReprint,
  onPreview,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  onSubmit: (e: FormEvent) => void;
  subtotalUsd: number;
  canDiscount: boolean;
  discountUsd: string;
  discountInvalid: boolean;
  onDiscount: (v: string) => void;
  totalUsd: number;
  totalLbp: number;
  rate: number;
  paymentMethod: PaymentMethod;
  onPaymentMethod: (m: PaymentMethod) => void;
  paidUsd: string;
  paidLbp: string;
  onPaidUsd: (v: string) => void;
  onPaidLbp: (v: string) => void;
  onExact: (currency: "usd" | "lbp") => void;
  tendered: boolean;
  insufficient: boolean;
  dueUsd: number;
  change: Change;
  checkoutError: string;
  checkingOut: boolean;
  cartEmpty: boolean;
  drawerOpen: boolean | null;
  lastSale: SaleDetail | null;
  onReprint: () => void;
  onPreview: () => void;
}) {
  const blocked = checkingOut || cartEmpty || insufficient || discountInvalid || drawerOpen === false;
  const blockedReason =
    drawerOpen === false
      ? null
      : cartEmpty
        ? "Add items to start a sale."
        : !tendered
          ? "Enter what the customer paid, or use Exact."
          : null;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex min-h-full flex-col" aria-label="Checkout">
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="kicker">Checkout</p>
        <p className="font-mono text-xs text-fg-3">1 USD = {rate.toLocaleString()} LBP</p>
      </div>

      <div className="px-5 pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-3 py-1">
          <span className="text-fg-2">Subtotal</span>
          <span className="font-medium">{formatUsd(subtotalUsd)}</span>
        </div>
        {canDiscount ? (
          <div className="flex items-center justify-between gap-3 py-1">
            <label htmlFor="pos-discount" className="text-fg-2">
              Discount
            </label>
            <div className="flex w-32 items-stretch overflow-hidden rounded-sm border border-line-input/70 bg-surface focus-within:border-accent">
              <span className="flex w-8 items-center justify-center border-r border-line font-mono text-xs text-fg-3">$</span>
              <input
                id="pos-discount"
                type="number"
                min={0}
                max={subtotalUsd}
                step="0.01"
                inputMode="decimal"
                className={`min-h-8 w-full min-w-0 bg-transparent px-2 text-right text-sm text-fg focus:outline-none ${discountInvalid ? "text-danger" : ""}`}
                value={discountUsd}
                onChange={(e) => onDiscount(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          </div>
        ) : null}
        {discountInvalid ? (
          <Status tone="danger" className="text-xs">
            Discount cannot exceed the subtotal.
          </Status>
        ) : null}
      </div>

      <div className="mx-5 mt-3 border-y border-line py-4">
        <p className="kicker">Total due</p>
        <p className="mt-1 text-readout font-bold tracking-[-0.035em] text-fg" aria-live="polite">
          {formatUsd(totalUsd)}
        </p>
        <p className="mt-1.5 font-mono text-base text-fg-2">{formatLbp(totalLbp)}</p>
      </div>

      <fieldset className="mt-4 px-5" disabled={drawerOpen === false}>
        <legend className="kicker mb-2">Payment</legend>
        <div className="segmented mb-3 flex w-full" role="group" aria-label="Payment method">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={paymentMethod === m.value}
              title={m.title}
              onClick={() => onPaymentMethod(m.value)}
              className={`tab flex-1 ${paymentMethod === m.value ? "tab-active" : ""}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <TenderField currency="USD" step="0.01" value={paidUsd} onChange={onPaidUsd} onExact={() => onExact("usd")} shortcut="F7" disabled={cartEmpty} />
          <TenderField currency="LBP" step="1" value={paidLbp} onChange={onPaidLbp} onExact={() => onExact("lbp")} shortcut="F8" disabled={cartEmpty} />
        </div>
      </fieldset>

      <div className="mt-4 min-h-[4.5rem] px-5" aria-live="polite">
        {tendered && !cartEmpty ? (
          insufficient ? (
            <div className="rounded-sm border border-danger-line bg-danger-bg px-3.5 py-2.5 text-danger-ink">
              <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.08em] uppercase">
                <Icon name="alert" className="h-3.5 w-3.5" /> Still due
              </p>
              <p className="mt-0.5 text-2xl font-bold tracking-[-0.02em]">{formatUsd(dueUsd)}</p>
              <p className="font-mono text-xs">{formatLbp(usdToLbp(dueUsd, rate))}</p>
            </div>
          ) : change.hasChange ? (
            <div className="rounded-sm border border-accent-line bg-accent-soft px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.08em] text-accent-text uppercase">
                <Icon name="cash" className="h-3.5 w-3.5" /> Change to return
              </p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-accent-text">
                {change.changeUsd > 0 ? <span className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">{formatUsd(change.changeUsd)}</span> : null}
                {change.changeLbp > 0 ? <span className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">{formatLbp(change.changeLbp)}</span> : null}
              </div>
              {change.changeUsd > 0 && change.changeLbp > 0 ? <p className="text-xs text-fg-2">Return both amounts.</p> : null}
            </div>
          ) : (
            <Status tone="ok">Exact payment — no change</Status>
          )
        ) : null}
      </div>

      <div className="mt-auto px-5 pt-3 pb-5">
        {drawerOpen === false ? (
          <div className="mb-3 rounded-sm border border-caution-line bg-caution-bg px-3.5 py-2.5 text-dense text-caution-ink">
            <p className="flex items-center gap-1.5 font-semibold">
              <Icon name="alert" className="h-4 w-4" /> The cash drawer is closed
            </p>
            <p className="mt-0.5">
              Sales cannot be completed until a shift is opened.{" "}
              <Link to="/cash" className="font-medium underline">
                Open the drawer
              </Link>
            </p>
          </div>
        ) : null}
        {checkoutError ? (
          <p role="alert" className="mb-3 flex gap-1.5 text-dense text-danger">
            <Icon name="alert" className="mt-0.5 h-4 w-4" />
            {checkoutError}
          </p>
        ) : null}
        <button type="submit" disabled={blocked} className="btn btn-primary btn-lg w-full justify-between">
          <span>{checkingOut ? "Completing sale…" : "Complete sale & print"}</span>
          <span className="kbd">Ctrl ↵</span>
        </button>
        {blockedReason && !checkingOut ? <p className="meta mt-2">{blockedReason}</p> : null}

        {lastSale ? (
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-dense">
            <Status tone="ok">
              Sale <span className="code">#{lastSale.sale.id}</span> · {formatUsd(lastSale.sale.total_usd)}
            </Status>
            <span className="flex gap-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onPreview}>
                Receipt
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onReprint}>
                <Icon name="printer" className="h-4 w-4" /> Reprint
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </form>
  );
}
