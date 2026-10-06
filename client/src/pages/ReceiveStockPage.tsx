import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { PageShell, ScrollBox } from "../components/PageShell";
import { api, type Product } from "../lib/api";

export default function ReceiveStockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [form, setForm] = useState({
    product_id: "",
    barcode: "",
    name: "",
    category: "",
    sale_price_usd: "",
    qty: "",
    expiry_date: "",
    cost_usd: "",
    notes: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    const payload =
      mode === "existing"
        ? {
            product_id: Number(form.product_id),
            qty: Number(form.qty),
            expiry_date: form.expiry_date,
            cost_usd: form.cost_usd ? Number(form.cost_usd) : null,
            notes: form.notes.trim() || null,
          }
        : {
            product: {
              barcode: form.barcode.trim() || null,
              name: form.name.trim(),
              category: form.category.trim() || null,
              sale_price_usd: Number(form.sale_price_usd),
            },
            qty: Number(form.qty),
            expiry_date: form.expiry_date,
            cost_usd: form.cost_usd ? Number(form.cost_usd) : null,
            notes: form.notes.trim() || null,
          };

    try {
      const result = await api.receiveStock(payload);
      setMessage(`Stock received. Product #${result.product_id}, batch #${result.batch_id}.`);
      setForm({
        product_id: "",
        barcode: "",
        name: "",
        category: "",
        sale_price_usd: "",
        qty: "",
        expiry_date: "",
        cost_usd: "",
        notes: "",
      });
      setProductSearch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive stock");
    }
  }

  return (
    <PageShell title="Receive stock" description="Add inventory to an existing product or create one on receive.">
      <ScrollBox className="mx-auto min-h-0 w-full max-w-2xl flex-1">
      <div className="space-y-6 pb-4">

      <div className="flex gap-2">
        <ModeButton active={mode === "existing"} onClick={() => setMode("existing")}>
          Existing product
        </ModeButton>
        <ModeButton active={mode === "new"} onClick={() => setMode("new")}>
          New product
        </ModeButton>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        {mode === "existing" ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Search product
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Name, MoPH code, or barcode (2+ chars)…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Product
              <select
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} {product.barcode ? `(${product.barcode})` : ""} — stock: {product.total_qty}
                  </option>
                ))}
              </select>
            </label>
            {productSearch.trim().length >= 2 && products.length === 0 ? (
              <p className="text-sm text-amber-700">
                No products match. Switch to &quot;New product&quot; or search MoPH catalog in Products.
              </p>
            ) : null}
            {productSearch.trim().length < 2 ? (
              <p className="text-sm text-slate-500">Type at least 2 characters to search the catalog.</p>
            ) : null}
          </div>
        ) : (
          <>
            <Field label="Barcode" value={form.barcode} onChange={(value) => setForm({ ...form, barcode: value })} />
            <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
            <Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
            <Field
              label="Sale price (USD)"
              value={form.sale_price_usd}
              onChange={(value) => setForm({ ...form, sale_price_usd: value })}
              type="number"
              required
            />
          </>
        )}

        <Field label="Quantity" value={form.qty} onChange={(value) => setForm({ ...form, qty: value })} type="number" required />
        <Field
          label="Expiry date"
          value={form.expiry_date}
          onChange={(value) => setForm({ ...form, expiry_date: value })}
          type="date"
          required
        />
        <Field
          label="Cost (USD, optional)"
          value={form.cost_usd}
          onChange={(value) => setForm({ ...form, cost_usd: value })}
          type="number"
        />
        <Field label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-teal-700">{message}</p> : null}

        <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          Receive stock
        </button>
      </form>
      </div>
      </ScrollBox>
    </PageShell>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        active ? "bg-teal-700 text-white" : "border border-slate-200 bg-white text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type={type}
        required={required}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? "0" : undefined}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
