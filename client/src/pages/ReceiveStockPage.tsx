import { FormEvent, useEffect, useState } from "react";
import { PageShell, ScrollBox } from "../components/PageShell";
import { Alert, Field } from "../components/ui";
import { api, localToday, type Product } from "../lib/api";

const emptyForm = {
  product_id: "",
  barcode: "",
  name: "",
  category: "",
  sale_price_usd: "",
  qty: "",
  expiry_date: "",
  cost_usd: "",
  notes: "",
};

const SHORT_DATED_DAYS = 90;

function daysUntil(isoDate: string) {
  const today = new Date(`${localToday()}T00:00:00`);
  return Math.round((new Date(`${isoDate}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

export default function ReceiveStockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = productSearch.trim();
    if (q.length > 0 && q.length < 2) {
      setProducts([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .getProducts({ search: q, pageSize: 50 })
        .then((result) => setProducts(result.items))
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load products"));
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const today = localToday();
  const qty = Number(form.qty);
  const qtyInvalid = form.qty !== "" && (!Number.isInteger(qty) || qty <= 0);
  const expired = form.expiry_date !== "" && form.expiry_date < today;
  const daysLeft = form.expiry_date && !expired ? daysUntil(form.expiry_date) : null;
  const shortDated = daysLeft !== null && daysLeft <= SHORT_DATED_DAYS;
  const set = (patch: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...patch }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (qtyInvalid || expired) return;
    setMessage("");
    setError("");
    setSaving(true);

    const common = {
      qty,
      expiry_date: form.expiry_date,
      cost_usd: form.cost_usd ? Number(form.cost_usd) : null,
      notes: form.notes.trim() || null,
    };
    const payload =
      mode === "existing"
        ? { product_id: Number(form.product_id), ...common }
        : {
            product: {
              barcode: form.barcode.trim() || null,
              name: form.name.trim(),
              category: form.category.trim() || null,
              sale_price_usd: Number(form.sale_price_usd),
            },
            ...common,
          };

    try {
      const result = await api.receiveStock(payload);
      const name = mode === "existing" ? products.find((p) => p.id === Number(form.product_id))?.name : form.name.trim();
      setMessage(`Received ${qty} × ${name ?? `product #${result.product_id}`} (batch #${result.batch_id}, expires ${form.expiry_date}).`);
      setForm(emptyForm);
      setProductSearch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="Receive stock" description="Add a delivered batch to an existing product, or create the product as you receive it.">
      <ScrollBox className="min-h-0 w-full max-w-2xl flex-1">
        <div className="space-y-4 pb-4">
          <div className="flex gap-2">
            <button type="button" className={`tab ${mode === "existing" ? "tab-active" : ""}`} onClick={() => setMode("existing")}>
              Existing product
            </button>
            <button type="button" className={`tab ${mode === "new" ? "tab-active" : ""}`} onClick={() => setMode("new")}>
              New product
            </button>
          </div>

          <form onSubmit={handleSubmit} className="card card-body space-y-4">
            {mode === "existing" ? (
              <>
                <Field label="Search product" hint={productSearch.trim().length < 2 ? "Type at least 2 characters to search the catalog." : undefined}>
                  <input
                    className="input"
                    placeholder="Name, MoPH code, or barcode…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </Field>
                <Field label="Product">
                  <select required className="input" value={form.product_id} onChange={(e) => set({ product_id: e.target.value })}>
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} {product.barcode ? `(${product.barcode})` : ""} — stock: {product.total_qty}
                      </option>
                    ))}
                  </select>
                </Field>
                {productSearch.trim().length >= 2 && products.length === 0 ? (
                  <Alert tone="warning">No products match. Switch to “New product”, or check the MoPH catalog under Products.</Alert>
                ) : null}
              </>
            ) : (
              <>
                <Field label="Barcode">
                  <input className="input" value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} />
                </Field>
                <Field label="Name">
                  <input className="input" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <Field label="Category">
                  <input className="input" value={form.category} onChange={(e) => set({ category: e.target.value })} />
                </Field>
                <Field label="Sale price (USD)">
                  <input type="number" min={0} step="0.01" required className="input" value={form.sale_price_usd} onChange={(e) => set({ sale_price_usd: e.target.value })} />
                </Field>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantity (units)" error={qtyInvalid ? "Whole number above 0" : null}>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  className={`input ${qtyInvalid ? "input-invalid" : ""}`}
                  value={form.qty}
                  onChange={(e) => set({ qty: e.target.value })}
                />
              </Field>
              <Field label="Expiry date" error={expired ? "This date is in the past — expired stock cannot be received." : null}>
                <input
                  type="date"
                  min={today}
                  required
                  className={`input ${expired ? "input-invalid" : ""}`}
                  value={form.expiry_date}
                  onChange={(e) => set({ expiry_date: e.target.value })}
                />
              </Field>
            </div>
            {shortDated ? (
              <Alert tone="warning">
                Short-dated: this batch expires in {daysLeft} day(s). Check it was agreed with the supplier.
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cost per unit (USD, optional)" hint="Used for profit reports.">
                <input type="number" min={0} step="0.01" className="input" value={form.cost_usd} onChange={(e) => set({ cost_usd: e.target.value })} />
              </Field>
              <Field label="Notes">
                <input className="input" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Supplier, invoice no.…" />
              </Field>
            </div>

            {error ? <Alert tone="error">{error}</Alert> : null}
            {message ? <Alert tone="success">{message}</Alert> : null}

            <button type="submit" className="btn btn-primary btn-lg w-full sm:w-auto" disabled={saving || qtyInvalid || expired}>
              {saving ? "Saving…" : "Receive stock"}
            </button>
          </form>
        </div>
      </ScrollBox>
    </PageShell>
  );
}
