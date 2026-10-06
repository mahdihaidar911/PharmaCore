import { FormEvent, useEffect, useState } from "react";
import { Pagination } from "../components/Pagination";
import { PageShell, Panel, ScrollBox } from "../components/PageShell";
import { useAuth } from "../context/AuthContext";
import { api, formatLbp, formatUsd, type PharmacySettings, type Product } from "../lib/api";

const PAGE_SIZE = 50;

const emptyForm = {
  barcode: "",
  name: "",
  category: "",
  sale_price_usd: "",
};

export default function ProductsPage() {
  const canManage = useAuth().can("products.manage");
  const [settings, setSettings] = useState<PharmacySettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProducts(query = search, pageNum = page) {
    setLoading(true);
    try {
      const [settingsData, productData] = await Promise.all([
        api.getSettings(),
        api.getProducts({ search: query, page: pageNum, pageSize: PAGE_SIZE }),
      ]);
      setSettings(settingsData);
      setProducts(productData.items);
      setTotal(productData.total);
      setTotalPages(productData.totalPages);
      setPage(productData.page);
      setError("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts(search, page).catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on search or page
  }, [search, page]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const payload = {
      barcode: form.barcode.trim() || null,
      name: form.name.trim(),
      category: form.category.trim() || null,
      sale_price_usd: Number(form.sale_price_usd),
    };

    try {
      if (editingId) {
        await api.updateProduct(editingId, payload);
        setMessage("Product updated.");
      } else {
        await api.createProduct(payload);
        setMessage("Product created.");
      }
      resetForm();
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      barcode: product.barcode ?? "",
      name: product.name,
      category: product.category ?? "",
      sale_price_usd: String(product.sale_price_usd),
    });
  }

  return (
    <PageShell
      title="Products"
      description="MoPH import fills names and ministry codes. Add your supplier barcode here (Edit) so POS scanning works."
    >
      <div className={`grid min-h-0 flex-1 gap-4 overflow-hidden ${canManage ? "xl:grid-cols-[360px_1fr]" : ""}`}>
        <ScrollBox className={`shrink-0 xl:max-h-full ${canManage ? "" : "hidden"}`}>
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-semibold text-slate-900">{editingId ? "Edit product" : "Add product"}</h3>
          <div className="mt-4 space-y-3">
            <Field
              label="Barcode (scanner)"
              value={form.barcode}
              onChange={(value) => setForm({ ...form, barcode: value })}
              hint="EAN/UPC from the box — not the MoPH ministry code"
            />
            <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
            <Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
            <Field
              label="Sale price (USD)"
              value={form.sale_price_usd}
              onChange={(value) => setForm({ ...form, sale_price_usd: value })}
              type="number"
              required
            />
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {message ? <p className="mt-3 text-sm text-teal-700">{message}</p> : null}
          <div className="mt-5 flex gap-3">
            <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
              {editingId ? "Save changes" : "Create product"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        </ScrollBox>

        <Panel className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Catalog</h3>
              <p className="text-sm text-slate-500">
                {total.toLocaleString()} product{total === 1 ? "" : "s"}
                {search.trim() ? ` matching “${search.trim()}”` : " in database"}
              </p>
            </div>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search name, MoPH code, barcode..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <ScrollBox className="mt-4 min-h-0 flex-1">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">MoPH code</th>
                  <th className="px-2 py-2 font-medium">Barcode</th>
                  <th className="px-2 py-2 font-medium">USD</th>
                  <th className="px-2 py-2 font-medium">LBP</th>
                  <th className="px-2 py-2 font-medium">Stock</th>
                  <th className="px-2 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-medium text-slate-900">{product.name}</td>
                    <td className="px-2 py-3 font-mono text-xs text-slate-600">{product.moph_code ?? "—"}</td>
                    <td className="px-2 py-3 text-slate-600">{product.barcode ?? "—"}</td>
                    <td className="px-2 py-3">{formatUsd(product.sale_price_usd)}</td>
                    <td className="px-2 py-3">
                      {settings ? formatLbp(product.sale_price_usd * settings.exchange_rate) : "—"}
                    </td>
                    <td className="px-2 py-3">{product.total_qty}</td>
                    <td className="px-2 py-3">
                      {canManage ? (
                        <button type="button" onClick={() => startEdit(product)} className="text-teal-700 hover:underline">
                          Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 && !loading ? (
              <p className="mt-4 text-sm text-slate-500">No products yet.</p>
            ) : null}
            {loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : null}
          </ScrollBox>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            disabled={loading}
          />
        </Panel>
      </div>
    </PageShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
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
      {hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}
