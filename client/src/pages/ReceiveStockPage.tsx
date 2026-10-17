import { FormEvent, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ExpiryCell } from "../components/ExpiryCell";
import { Icon } from "../components/icons";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { ProductName } from "../components/ProductName";
import { Alert, EmptyState, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, localToday, parseServerDate, type Product, type StockBatch } from "../lib/api";
import { toast } from "../lib/toast";

const emptyForm = {
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
  const canSeeStock = useAuth().can("inventory.view");
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Product | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<StockBatch[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const loadRecent = useCallback(() => {
    if (!canSeeStock) return;
    api
      .getBatches({ sort: "received", pageSize: 12 })
      .then((r) => setRecent(r.items))
      .catch(() => setRecent([]));
  }, [canSeeStock]);

  useEffect(loadRecent, [loadRecent]);

  useEffect(() => {
    const q = productSearch.trim();
    if (selected || q.length < 2) {
      setProducts([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .getProducts({ search: q, pageSize: 8 })
        .then((result) => {
          setProducts(result.items);
          setActive(0);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load products"));
    }, 200);
    return () => clearTimeout(timer);
  }, [productSearch, selected]);

  const today = localToday();
  const qty = Number(form.qty);
  const qtyInvalid = form.qty !== "" && (!Number.isInteger(qty) || qty <= 0);
  const expired = form.expiry_date !== "" && form.expiry_date < today;
  const daysLeft = form.expiry_date && !expired ? daysUntil(form.expiry_date) : null;
  const shortDated = daysLeft !== null && daysLeft <= SHORT_DATED_DAYS;
  const set = (patch: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...patch }));

  function choose(product: Product) {
    setSelected(product);
    setProducts([]);
    setError("");
    requestAnimationFrame(() => qtyRef.current?.focus());
  }

  function clearChoice() {
    setSelected(null);
    setProductSearch("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (products.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(products.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(products[active]);
    } else if (e.key === "Escape") {
      setProductSearch("");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (qtyInvalid || expired || saving) return;
    if (mode === "existing" && !selected) {
      setError("Choose the product first.");
      searchRef.current?.focus();
      return;
    }
    setError("");
    setSaving(true);

    const common = {
      qty,
      expiry_date: form.expiry_date,
      cost_usd: form.cost_usd ? Number(form.cost_usd) : null,
      notes: form.notes.trim() || null,
    };
    const payload =
      mode === "existing" && selected
        ? { product_id: selected.id, ...common }
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
      const name = mode === "existing" ? selected?.name : form.name.trim();
      toast(`Received ${qty} × ${name ?? `product #${result.product_id}`} · batch #${result.batch_id}, expires ${form.expiry_date}`);
      setForm(emptyForm);
      setSelected(null);
      setProductSearch("");
      loadRecent();
      requestAnimationFrame(() => searchRef.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive stock");
    } finally {
      setSaving(false);
    }
  }

  const q = productSearch.trim();

  return (
    <PageShell title="Receive stock" description="Add a delivered batch to an existing product, or create the product as you receive it.">
      <div className={`grid min-h-0 flex-1 gap-5 ${canSeeStock ? "xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]" : ""}`}>
        <ScrollBox className="min-h-0 w-full max-w-2xl">
          <div className="space-y-3 pb-4">
            <div className="segmented" role="group" aria-label="Product">
              <button type="button" aria-pressed={mode === "existing"} className={`tab ${mode === "existing" ? "tab-active" : ""}`} onClick={() => setMode("existing")}>
                Existing product
              </button>
              <button type="button" aria-pressed={mode === "new"} className={`tab ${mode === "new" ? "tab-active" : ""}`} onClick={() => setMode("new")}>
                New product
              </button>
            </div>

            <form onSubmit={handleSubmit} className="card card-body space-y-4">
              {mode === "existing" ? (
                selected ? (
                  <div>
                    <span className="field-label">Product</span>
                    <div className="flex items-center gap-3 rounded-md border border-accent-line bg-accent-soft px-3 py-2.5">
                      <Icon name="check" className="h-4 w-4 shrink-0 text-accent-text" />
                      <div className="min-w-0 flex-1">
                        <ProductName name={selected.name} />
                        <p className="text-xs text-fg-3">
                          {selected.barcode ? <span className="code">{selected.barcode}</span> : "No barcode"} · {selected.total_qty} in stock now
                        </p>
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={clearChoice}>
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <Field label="Product" hint={q.length < 2 ? "Name, MoPH code or barcode — at least 2 characters." : undefined}>
                      <input
                        ref={searchRef}
                        className="input"
                        placeholder="Search the catalogue…"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        onKeyDown={onSearchKey}
                        role="combobox"
                        aria-expanded={products.length > 0}
                        aria-controls="receive-results"
                        aria-activedescendant={products[active] ? `receive-opt-${products[active].id}` : undefined}
                        autoFocus
                      />
                    </Field>
                    {products.length > 0 ? (
                      <ul id="receive-results" role="listbox" className="mt-1.5 animate-enter overflow-hidden rounded-md border border-line-strong bg-surface p-1 shadow-overlay">
                        {products.map((p, i) => (
                          <li
                            key={p.id}
                            id={`receive-opt-${p.id}`}
                            role="option"
                            aria-selected={i === active}
                            className={`flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 ${i === active ? "bg-accent-soft shadow-[inset_3px_0_0_var(--c-accent)]" : "hover:bg-surface-2"}`}
                            onMouseEnter={() => setActive(i)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              choose(p);
                            }}
                          >
                            <ProductName name={p.name} className="flex-1" />
                            <span className="code hidden text-xs text-fg-3 sm:inline">{p.moph_code ?? p.barcode ?? ""}</span>
                            <span className={`w-20 text-right text-xs ${p.total_qty > 0 ? "text-fg-2" : "text-fg-4"}`}>{p.total_qty > 0 ? `${p.total_qty} in stock` : "none"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {q.length >= 2 && products.length === 0 ? (
                      <p className="mt-1.5 text-dense text-fg-3">
                        No match yet. Keep typing, or switch to “New product”.
                      </p>
                    ) : null}
                  </div>
                )
              ) : (
                <>
                  <Field label="Barcode">
                    <input className="input code" value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} />
                  </Field>
                  <Field label="Name">
                    <input className="input" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Category">
                      <input className="input" value={form.category} onChange={(e) => set({ category: e.target.value })} />
                    </Field>
                    <Field label="Sale price (USD)">
                      <input type="number" min={0} step="0.01" required className="input" value={form.sale_price_usd} onChange={(e) => set({ sale_price_usd: e.target.value })} />
                    </Field>
                  </div>
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Quantity (units)" error={qtyInvalid ? "Whole number above 0" : null}>
                  <input
                    ref={qtyRef}
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

              <button type="submit" className="btn btn-primary btn-lg w-full sm:w-auto" disabled={saving || qtyInvalid || expired}>
                {saving ? "Saving…" : "Receive stock"}
              </button>
            </form>
          </div>
        </ScrollBox>

        {canSeeStock ? (
          <section aria-labelledby="recent-head" className="sheet flex min-h-0 flex-col px-4 pt-3 pb-2">
            <SectionHead
              id="recent-head"
              title="Received recently"
              action={
                <Link to="/inventory" className="text-dense font-medium text-accent-text hover:underline">
                  Inventory
                </Link>
              }
            />
            <ScrollBox className="mt-2 min-h-0 flex-1">
              {recent === null ? null : recent.length === 0 ? (
                <EmptyState title="Nothing received yet." />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="!pl-0">Product</th>
                      <th className="num">On hand</th>
                      <th>Expiry</th>
                      <th className="!pr-0">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((b) => (
                      <tr key={b.id}>
                        <td className="w-full max-w-0 !pl-0">
                          <ProductName name={b.product_name} />
                        </td>
                        <td className="num font-medium">{b.qty}</td>
                        <td className="whitespace-nowrap">
                          <ExpiryCell date={b.expiry_date} meter={false} />
                        </td>
                        <td className="code !pr-0 whitespace-nowrap text-fg-3">{parseServerDate(b.received_at).toLocaleDateString("en-CA")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ScrollBox>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
