import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatLbp, formatUsd, parseServerDate, type Product, type StockBatch } from "../lib/api";
import { splitProductName } from "../lib/productName";
import { AdjustStockModal } from "./AdjustStockModal";
import { ExpiryCell } from "./ExpiryCell";
import { Icon } from "./icons";
import { Alert, Field, Modal, Spinner, Status } from "./ui";

type Mode = "view" | "edit";

type FormState = { barcode: string; name: string; category: string; sale_price_usd: string; is_active: boolean };

const EMPTY_FORM: FormState = { barcode: "", name: "", category: "", sale_price_usd: "", is_active: true };

function toForm(product: Product): FormState {
  return {
    barcode: product.barcode ?? "",
    name: product.name,
    category: product.category ?? "",
    sale_price_usd: String(product.sale_price_usd),
    is_active: product.is_active,
  };
}

/**
 * One panel for looking a product up, editing it and adding a new one.
 * `productId === null` opens it in "add product" mode.
 */
export function ProductInspector({
  productId,
  exchangeRate,
  canManage,
  canAdjust,
  onClose,
  onSaved,
}: {
  productId: number | null;
  exchangeRate: number | null;
  canManage: boolean;
  canAdjust: boolean;
  onClose: () => void;
  onSaved: (message: string, productId: number) => void;
}) {
  const creating = productId === null;
  const [product, setProduct] = useState<Product | null>(null);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [loading, setLoading] = useState(!creating);
  const [mode, setMode] = useState<Mode>(creating ? "edit" : "view");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [adjusting, setAdjusting] = useState<StockBatch | null>(null);

  const load = useCallback(async () => {
    if (productId === null) return;
    setLoading(true);
    try {
      const [p, b] = await Promise.all([api.getProduct(productId), api.getBatches({ product_id: productId, pageSize: 100, sort: "expiry" })]);
      setProduct(p);
      setBatches(b.items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this product");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const price = Number(form.sale_price_usd);
  const priceInvalid = form.sale_price_usd !== "" && (!Number.isFinite(price) || price < 0);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (priceInvalid || saving) return;
    setSaving(true);
    setError("");
    const payload = {
      barcode: form.barcode.trim() || null,
      name: form.name.trim(),
      category: form.category.trim() || null,
      sale_price_usd: price,
    };
    try {
      if (creating) {
        const created = await api.createProduct(payload);
        onSaved("Product created.", created.id);
        return;
      }
      const updated = await api.updateProduct(productId, { ...payload, is_active: form.is_active });
      setProduct({ ...updated, total_qty: product?.total_qty ?? updated.total_qty });
      setMode("view");
      onSaved(form.is_active ? "Product updated." : "Product updated and deactivated.", productId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    if (!product) return;
    setForm(toForm(product));
    setError("");
    setMode("edit");
  }

  const name = product ? splitProductName(product.name) : null;
  const title = creating ? "Add product" : product ? product.name : "Product";
  const nextExpiry = batches.find((b) => b.qty > 0);

  const heading = creating ? (
    <h2 className="text-base font-semibold text-fg">Add product</h2>
  ) : (
    <div className="min-w-0">
      <p className="kicker">{mode === "edit" ? "Editing product" : `Product #${productId}`}</p>
      {name ? (
        <>
          <h2 className="mt-0.5 text-lg leading-snug font-semibold tracking-[-0.01em] text-fg">{name.title}</h2>
          {name.form ? <p className="text-dense text-fg-3">{name.form}</p> : null}
        </>
      ) : (
        <h2 className="mt-0.5 text-lg font-semibold text-fg-3">Loading…</h2>
      )}
    </div>
  );

  const footer =
    mode === "edit" ? (
      <>
        <button type="button" className="btn btn-secondary" onClick={creating ? onClose : () => setMode("view")}>
          Cancel
        </button>
        <button type="submit" form="product-form" className="btn btn-primary" disabled={priceInvalid || saving}>
          {saving ? "Saving…" : creating ? "Create product" : "Save changes"}
        </button>
      </>
    ) : canManage && product ? (
      <button type="button" className="btn btn-secondary" onClick={startEdit}>
        <Icon name="edit" className="h-4 w-4" /> Edit product
      </button>
    ) : undefined;

  return (
    <>
      <Modal open side size="md" title={title} heading={heading} onClose={onClose} footer={footer}>
        {mode === "edit" ? (
          <form id="product-form" onSubmit={save} className="space-y-3.5">
            <Field label="Barcode (scanner)" hint="EAN/UPC from the box — not the MoPH ministry code">
              <input className="input code" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
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
            {!creating ? (
              <label className="flex items-start gap-2 text-sm text-fg-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <span>
                  Active
                  <span className="block text-xs text-fg-3">Inactive products are hidden from the till and cannot be sold. Stock and history are kept.</span>
                </span>
              </label>
            ) : null}
            {error ? <Alert tone="error">{error}</Alert> : null}
          </form>
        ) : loading && !product ? (
          <Spinner />
        ) : product ? (
          <div className="space-y-5">
            {error ? <Alert tone="error">{error}</Alert> : null}
            {!product.is_active ? (
              <Alert tone="warning" title="Inactive">
                Hidden from the till and cannot be sold.
              </Alert>
            ) : null}

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
              <div className="bg-surface px-3.5 py-3">
                <p className="kicker">Sale price</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-fg">{formatUsd(product.sale_price_usd)}</p>
                <p className="code text-xs text-fg-3">{exchangeRate ? formatLbp(product.sale_price_usd * exchangeRate) : " "}</p>
              </div>
              <div className="bg-surface px-3.5 py-3">
                <p className="kicker">On hand</p>
                <p className={`mt-1 text-2xl font-semibold tracking-[-0.02em] ${product.total_qty > 0 ? "text-fg" : "text-fg-4"}`}>
                  {product.total_qty}
                  <span className="ml-1 text-sm font-normal text-fg-3">unit{product.total_qty === 1 ? "" : "s"}</span>
                </p>
                {product.total_qty > 0 ? (
                  <p className="text-xs text-fg-3">
                    in {batches.filter((b) => b.qty > 0).length} batch{batches.filter((b) => b.qty > 0).length === 1 ? "" : "es"}
                  </p>
                ) : (
                  <Status tone="caution" className="text-xs">
                    Out of stock
                  </Status>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-dense">
              <dt className="text-fg-3">MoPH code</dt>
              <dd className="code text-fg">{product.moph_code ?? <span className="text-fg-4">—</span>}</dd>
              <dt className="text-fg-3">Barcode</dt>
              <dd className="code text-fg">{product.barcode ?? <span className="font-sans text-fg-4">None linked — the till cannot scan it</span>}</dd>
              {product.brand_name ? (
                <>
                  <dt className="text-fg-3">Brand</dt>
                  <dd className="text-fg">{product.brand_name}</dd>
                </>
              ) : null}
              <dt className="text-fg-3">Category</dt>
              <dd className="text-fg">{product.category ?? <span className="text-fg-4">—</span>}</dd>
              <dt className="text-fg-3">Last updated</dt>
              <dd className="code text-fg-2">{parseServerDate(product.updated_at).toLocaleDateString("en-CA")}</dd>
            </dl>

            <section>
              <div className="section-head mb-2">
                <h3 className="text-dense font-semibold text-fg">Batches</h3>
                <span className="code text-xs text-fg-3">{batches.length}</span>
                <span className="h-px min-w-4 flex-1 bg-line" />
                {nextExpiry ? <span className="text-xs text-fg-3">Sells earliest expiry first</span> : null}
              </div>
              {batches.length === 0 ? (
                <p className="text-dense text-fg-3">No stock received yet.</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-line">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Expiry</th>
                        <th className="num">Qty</th>
                        {canManage ? <th className="num">Cost</th> : null}
                        <th>Received</th>
                        {canAdjust ? (
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((batch) => {
                        return (
                          <tr key={batch.id}>
                            <td className="whitespace-nowrap">
                              <ExpiryCell date={batch.expiry_date} />
                            </td>
                            <td className="num font-medium">{batch.qty}</td>
                            {canManage ? <td className="num text-fg-2">{batch.cost_usd == null ? "—" : formatUsd(batch.cost_usd)}</td> : null}
                            <td className="code whitespace-nowrap text-fg-3">{parseServerDate(batch.received_at).toLocaleDateString("en-CA")}</td>
                            {canAdjust ? (
                              <td className="text-right">
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdjusting(batch)}>
                                  Adjust
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : error ? (
          <Alert tone="error">{error}</Alert>
        ) : null}
      </Modal>

      {adjusting ? (
        <AdjustStockModal
          batch={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={(message) => {
            setAdjusting(null);
            void load();
            if (productId !== null) onSaved(message, productId);
          }}
        />
      ) : null}
    </>
  );
}
