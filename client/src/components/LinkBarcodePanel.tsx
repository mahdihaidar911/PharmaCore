import { useEffect, useRef, useState } from "react";
import { api, formatUsd, type PosProduct, type Product } from "../lib/api";
import { Icon } from "./icons";
import { ScrollBox } from "./PageShell";
import { ProductName } from "./ProductName";

function toPosProduct(p: Product): PosProduct {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    category: p.category,
    sale_price_usd: p.sale_price_usd,
    total_qty: p.total_qty,
  };
}

type Props = {
  barcode: string;
  onLinked: (product: PosProduct) => void;
  onCancel: () => void;
};

export function LinkBarcodePanel({ barcode, onLinked, onCancel }: Props) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mode === "search") searchInputRef.current?.focus();
      else nameInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .getProducts({ search: q, pageSize: 30 })
        .then((page) => setResults(page.items))
        .catch((err) => setError(err instanceof Error ? err.message : "Search failed"))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function linkToProduct(product: Product) {
    setError("");
    setLinkingId(product.id);
    try {
      const updated = await api.linkProductBarcode(product.id, barcode);
      onLinked(toPosProduct(updated));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save barcode");
    } finally {
      setLinkingId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const name = newName.trim();
    const sale_price_usd = Number(newPrice);
    if (!name) {
      setError("Product name is required.");
      return;
    }
    if (!Number.isFinite(sale_price_usd) || sale_price_usd < 0) {
      setError("Enter a valid sale price (USD).");
      return;
    }

    setCreating(true);
    try {
      const created = await api.createProduct({
        barcode,
        name,
        category: newCategory.trim() || null,
        sale_price_usd,
      });
      onLinked(toPosProduct(created));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create product");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div data-pos-link-panel className="shrink-0 rounded-md border border-caution-rule border-l-[3px] border-l-caution bg-paper-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker flex items-center gap-1.5 text-caution">
            <Icon name="barcode" className="h-3.5 w-3.5" /> Unknown barcode
          </p>
          <p className="mt-1 font-mono text-lg font-medium text-ink">{barcode}</p>
          <p className="mt-0.5 text-dense text-ink-3">Link it to a catalogue product once — every later scan will find it.</p>
        </div>
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-sm">
          Cancel
        </button>
      </div>

      <div className="segmented mt-3" role="group" aria-label="How to resolve the barcode">
        <button type="button" aria-pressed={mode === "search"} onClick={() => setMode("search")} className={`tab ${mode === "search" ? "tab-active" : ""}`}>
          Find in catalogue
        </button>
        <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")} className={`tab ${mode === "create" ? "tab-active" : ""}`}>
          Add new product
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-dense text-danger">
          <Icon name="alert" className="h-4 w-4" />
          {error}
        </p>
      ) : null}

      {mode === "search" ? (
        <div className="mt-3 space-y-2">
          <input
            ref={searchInputRef}
            type="text"
            autoComplete="off"
            className="input"
            placeholder="Search name or MoPH code (2+ characters)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <ScrollBox className="max-h-56 rounded-sm border border-rule">
            {loading ? <p className="px-3 py-3 text-dense text-ink-3">Searching…</p> : null}
            {!loading && search.trim().length < 2 ? <p className="px-3 py-3 text-dense text-ink-3">Type to search the catalogue.</p> : null}
            {!loading && search.trim().length >= 2 && results.length === 0 ? (
              <p className="px-3 py-3 text-dense text-ink-3">No matches. Try another name, or add a new product.</p>
            ) : null}
            {results.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <ProductName name={product.name} />
                  <p className="text-xs text-ink-3">
                    {product.moph_code ? <span className="code">MoPH {product.moph_code}</span> : "No MoPH code"}
                    {product.barcode ? <span className="code"> · {product.barcode}</span> : null} · {product.total_qty} in stock ·{" "}
                    {formatUsd(product.sale_price_usd)}
                  </p>
                </div>
                <button type="button" disabled={linkingId != null} onClick={() => linkToProduct(product)} className="btn btn-primary btn-sm">
                  {linkingId === product.id ? "Saving…" : "Link & use"}
                </button>
              </div>
            ))}
          </ScrollBox>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="field-label">Name</span>
            <input
              ref={nameInputRef}
              required
              type="text"
              autoComplete="off"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <label className="block">
            <span className="field-label">Sale price (USD)</span>
            <input required type="number" min={0} step="0.01" className="input" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Category (optional)</span>
            <input className="input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? "Creating…" : "Create product & save barcode"}
            </button>
            <p className="meta">Barcode <span className="code">{barcode}</span>. Receive stock afterwards to sell it.</p>
          </div>
        </form>
      )}
    </div>
  );
}
