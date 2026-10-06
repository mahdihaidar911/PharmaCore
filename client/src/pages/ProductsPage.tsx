import { FormEvent, useEffect, useState } from "react";
import { Pagination } from "../components/Pagination";
import { PageShell, Panel, ScrollBox } from "../components/PageShell";
import { Alert, Badge, EmptyState, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, formatLbp, formatUsd, type PharmacySettings, type Product } from "../lib/api";

const PAGE_SIZE = 50;

const emptyForm = {
  barcode: "",
  name: "",
  category: "",
  sale_price_usd: "",
  is_active: true,
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
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  /** Below xl the form is collapsed so the catalog stays visible on tablets. */
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProducts(query = search, pageNum = page) {
    setLoading(true);
    try {
      const [settingsData, productData] = await Promise.all([
        api.getSettings(),
        api.getProducts({ search: query, page: pageNum, pageSize: PAGE_SIZE, includeInactive: showInactive }),
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
      loadProducts(search, page).catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on search, page or filter
  }, [search, page, showInactive]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
  }

  const price = Number(form.sale_price_usd);
  const priceInvalid = form.sale_price_usd !== "" && (!Number.isFinite(price) || price < 0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (priceInvalid) return;
    setError("");
    setMessage("");

    const payload = {
      barcode: form.barcode.trim() || null,
      name: form.name.trim(),
      category: form.category.trim() || null,
      sale_price_usd: price,
      is_active: form.is_active,
    };

    try {
      if (editingId) {
        await api.updateProduct(editingId, payload);
        setMessage(form.is_active ? "Product updated." : "Product updated and deactivated — it can no longer be sold.");
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
    setMessage("");
    setError("");
    setForm({
      barcode: product.barcode ?? "",
      name: product.name,
      category: product.category ?? "",
      sale_price_usd: String(product.sale_price_usd),
      is_active: product.is_active,
    });
  }

  return (
    <PageShell
      title="Products"
      description="MoPH import fills names and ministry codes. Add your supplier barcode here (Edit) so POS scanning works."
    >
      <div className={`grid min-h-0 flex-1 gap-4 overflow-hidden ${canManage ? "xl:grid-cols-[360px_1fr]" : ""}`}>
        {canManage ? (
          <ScrollBox className={`shrink-0 xl:block xl:max-h-full ${formOpen || editingId ? "" : "hidden"}`}>
            <form onSubmit={handleSubmit} className="card card-body space-y-3">
              <h3 className="card-title">{editingId ? "Edit product" : "Add product"}</h3>
              <Field label="Barcode (scanner)" hint="EAN/UPC from the box — not the MoPH ministry code">
                <input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </Field>
              <Field label="Name">
                <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Category">
                <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </Field>
              <Field label="Sale price (USD)" error={priceInvalid ? "Enter a positive price" : null}>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  className={`input ${priceInvalid ? "input-invalid" : ""}`}
                  value={form.sale_price_usd}
                  onChange={(e) => setForm({ ...form, sale_price_usd: e.target.value })}
                />
              </Field>
              {editingId ? (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  <span>
                    Active
                    <span className="block text-xs text-slate-500">Inactive products are hidden from POS and cannot be sold. Stock and history are kept.</span>
                  </span>
                </label>
              ) : null}
              {error ? <Alert tone="error">{error}</Alert> : null}
              {message ? <Alert tone="success">{message}</Alert> : null}
              <div className="flex gap-2 pt-1">
                <button type="submit" className="btn btn-primary" disabled={priceInvalid}>
                  {editingId ? "Save changes" : "Create product"}
                </button>
                {editingId || formOpen ? (
                  <button type="button" onClick={resetForm} className={`btn btn-secondary ${editingId ? "" : "xl:hidden"}`}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </ScrollBox>
        ) : null}

        <Panel className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="card-title">Catalog</h3>
              <p className="text-sm text-slate-500">
                {total.toLocaleString()} product{total === 1 ? "" : "s"}
                {search.trim() ? ` matching “${search.trim()}”` : showInactive ? " (including inactive)" : ""}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {canManage && !formOpen && !editingId ? (
                <button type="button" className="btn btn-primary btn-sm xl:hidden" onClick={() => setFormOpen(true)}>
                  Add product
                </button>
              ) : null}
              {canManage ? (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={showInactive}
                    onChange={(e) => {
                      setShowInactive(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Show inactive
                </label>
              ) : null}
              <input
                className="input sm:w-72"
                placeholder="Search name, MoPH code, barcode…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          {!canManage && error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}

          <ScrollBox className="mt-4 min-h-0 flex-1">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>MoPH code</th>
                  <th>Barcode</th>
                  <th className="text-right">USD</th>
                  <th className="text-right">LBP</th>
                  <th className="text-right">Stock</th>
                  {canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className={product.is_active ? "" : "bg-slate-50 text-slate-500"}>
                    <td className="font-medium text-slate-900">
                      {product.name} {product.is_active ? null : <Badge tone="neutral">Inactive</Badge>}
                    </td>
                    <td className="font-mono text-xs text-slate-600">{product.moph_code ?? "—"}</td>
                    <td className="text-slate-600">{product.barcode ?? "—"}</td>
                    <td className="text-right tabular-nums">{formatUsd(product.sale_price_usd)}</td>
                    <td className="text-right tabular-nums">{settings ? formatLbp(product.sale_price_usd * settings.exchange_rate) : "—"}</td>
                    <td className="text-right tabular-nums">{product.total_qty}</td>
                    {canManage ? (
                      <td className="text-right">
                        <button type="button" onClick={() => startEdit(product)} className="btn btn-ghost btn-sm">
                          Edit
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 && !loading ? <EmptyState title="No products found" /> : null}
            {loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : null}
          </ScrollBox>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
        </Panel>
      </div>
    </PageShell>
  );
}
