import { FormEvent, useEffect, useState } from "react";
import { Icon } from "../components/icons";
import { Pagination } from "../components/Pagination";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { ProductName } from "../components/ProductName";
import { Alert, EmptyState, Field, SearchInput, Spinner, Status } from "../components/ui";
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
      description="The MoPH catalogue fills names and ministry codes. Add the box barcode (Edit) so the till can scan it."
      actions={
        canManage && !formOpen && !editingId ? (
          <button type="button" className="btn btn-primary xl:hidden" onClick={() => setFormOpen(true)}>
            <Icon name="plus" className="h-4 w-4" /> Add product
          </button>
        ) : null
      }
    >
      <div className={`grid min-h-0 flex-1 gap-5 overflow-hidden ${canManage ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
        {canManage ? (
          <ScrollBox className={`order-first shrink-0 xl:order-last xl:block xl:max-h-full ${formOpen || editingId ? "" : "hidden"}`}>
            <form onSubmit={handleSubmit} className="space-y-3">
              <SectionHead title={editingId ? "Edit product" : "Add product"} />
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
                <label className="flex items-start gap-2 text-sm text-ink-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  <span>
                    Active
                    <span className="block text-xs text-ink-3">Inactive products are hidden from POS and cannot be sold. Stock and history are kept.</span>
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

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
            <SearchInput
              label="Search products"
              className="w-full sm:w-80"
              placeholder="Name, MoPH code or barcode"
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            {canManage ? (
              <label className="flex items-center gap-2 text-dense text-ink-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-forest-700"
                  checked={showInactive}
                  onChange={(e) => {
                    setShowInactive(e.target.checked);
                    setPage(1);
                  }}
                />
                Include inactive
              </label>
            ) : null}
            <p className="meta ml-auto">
              {total.toLocaleString()} product{total === 1 ? "" : "s"}
              {search.trim() ? ` matching “${search.trim()}”` : ""}
            </p>
          </div>
          {!canManage && error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}

          <div className="sheet flex min-h-0 flex-1 flex-col overflow-hidden">
            <ScrollBox className={`min-h-0 flex-1 ${loading ? "opacity-60" : ""}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="hidden md:table-cell">MoPH</th>
                    <th className="hidden lg:table-cell">Barcode</th>
                    <th className="num">Price</th>
                    <th className="num">Stock</th>
                    {canManage ? (
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className={editingId === product.id ? "[&>td]:bg-lime-200/70" : ""}>
                      <td className={`w-full max-w-0 min-w-56 ${product.is_active ? "" : "opacity-60"}`}>
                        <ProductName name={product.name} />
                        {product.is_active ? null : (
                          <Status tone="muted" className="text-xs">
                            Inactive — hidden from the till
                          </Status>
                        )}
                      </td>
                      <td className="code hidden text-ink-2 md:table-cell">{product.moph_code ?? "—"}</td>
                      <td className="code hidden text-ink-2 lg:table-cell">{product.barcode ?? <span className="text-ink-4">none</span>}</td>
                      <td className="num">
                        <span className="block font-medium">{formatUsd(product.sale_price_usd)}</span>
                        <span className="block text-xs text-ink-3">{settings ? formatLbp(product.sale_price_usd * settings.exchange_rate) : ""}</span>
                      </td>
                      <td className={`num ${product.total_qty > 0 ? "font-medium" : "text-ink-4"}`}>{product.total_qty}</td>
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
              {products.length === 0 && !loading ? <EmptyState title="No products found." description={search ? "Try part of the name, the MoPH code or the barcode." : undefined} /> : null}
              {loading && products.length === 0 ? <Spinner className="p-4" /> : null}
            </ScrollBox>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
