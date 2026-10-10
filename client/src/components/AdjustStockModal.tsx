import { FormEvent, useState } from "react";
import { api, localToday, type AdjustmentReason, type StockBatch } from "../lib/api";
import { ProductName } from "./ProductName";
import { Alert, Field, Modal } from "./ui";

const REASONS: { value: AdjustmentReason; label: string; direction: "remove" | "both" }[] = [
  { value: "expired", label: "Expired — write off", direction: "remove" },
  { value: "damaged", label: "Damaged / broken", direction: "remove" },
  { value: "lost", label: "Lost / missing", direction: "remove" },
  { value: "count_correction", label: "Stock count correction", direction: "both" },
  { value: "other", label: "Other (explain in notes)", direction: "both" },
];

export function AdjustStockModal({ batch, onClose, onDone }: { batch: StockBatch; onClose: () => void; onDone: (message: string) => void }) {
  const isExpired = batch.expiry_date <= localToday();
  const [direction, setDirection] = useState<"remove" | "add">("remove");
  const [qty, setQty] = useState(isExpired ? String(batch.qty) : "1");
  const [reason, setReason] = useState<AdjustmentReason>(isExpired ? "expired" : "damaged");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const amount = Number.parseInt(qty, 10) || 0;
  const resulting = direction === "remove" ? batch.qty - amount : batch.qty + amount;
  const reasons = REASONS.filter((r) => direction === "remove" || r.direction === "both");
  const invalid = amount <= 0 || resulting < 0 || (reason === "other" && !notes.trim());

  function switchDirection(next: "remove" | "add") {
    setDirection(next);
    if (next === "add" && !REASONS.find((r) => r.value === reason && r.direction === "both")) {
      setReason("count_correction");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    setSaving(true);
    setError("");
    try {
      await api.adjustStock({
        batch_id: batch.id,
        qty_change: direction === "remove" ? -amount : amount,
        reason,
        notes: notes.trim() || null,
      });
      onDone(`${batch.product_name}: batch #${batch.id} now has ${resulting} unit(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Adjust stock"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="adjust-form" className={`btn ${direction === "remove" ? "btn-danger" : "btn-primary"}`} disabled={saving || invalid}>
            {saving ? "Saving…" : direction === "remove" ? `Remove ${amount || ""} unit(s)` : `Add ${amount || ""} unit(s)`}
          </button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <div className="border-l-2 border-ink bg-paper py-2 pr-3 pl-3 text-sm">
          <ProductName name={batch.product_name} />
          <p className="mt-0.5 text-dense text-ink-3">
            Batch <span className="code">#{batch.id}</span> · expires <span className="code">{batch.expiry_date}</span> · {batch.qty} in stock
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={direction === "remove"} className={`btn ${direction === "remove" ? "btn-danger" : "btn-secondary"}`} onClick={() => switchDirection("remove")}>
            Remove stock
          </button>
          <button type="button" aria-pressed={direction === "add"} className={`btn ${direction === "add" ? "btn-primary" : "btn-secondary"}`} onClick={() => switchDirection("add")}>
            Add stock
          </button>
        </div>

        <Field label="Quantity" error={resulting < 0 ? `Only ${batch.qty} unit(s) in this batch` : null} hint={`After adjustment: ${Math.max(0, resulting)} unit(s)`}>
          <input type="number" min={1} step={1} className="input" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>

        <Field label="Reason">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)}>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={reason === "other" ? "Notes (required)" : "Notes (optional)"}>
          <textarea className="input min-h-20" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <p className="text-xs text-ink-3">The adjustment is recorded in stock movements with your name and cannot be deleted.</p>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
