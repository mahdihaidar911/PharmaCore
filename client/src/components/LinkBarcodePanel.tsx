import { useEffect, useRef, useState } from "react";
import { api, type PosProduct, type Product } from "../lib/api";
import { ScrollBox } from "./PageShell";

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
    <div
      data-pos-link-panel
      className="shrink-0 rounded-xl border-2 border-amber-300 bg-amber-50/80 p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Link barcode to product</h3>
          <p className="mt-1 font-mono text-sm text-slate-700">{barcode}</p>
          <p className="mt-1 text-xs text-slate-600">
            Search your MoPH catalog, link this scan, or add a new product.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "search" ? "bg-teal-700 text-white" : "bg-white text-slate-700 border border-slate-200"
          }`}
        >
          Find in catalog
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "create" ? "bg-teal-700 text-white" : "bg-white text-slate-700 border border-slate-200"
          }`}
        >
          Add new product
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {mode === "search" ? (
        <div className="mt-3 space-y-2">
          <input
            ref={searchInputRef}
            type="text"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="Search name or MoPH code (2+ chars)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <ScrollBox className="max-h-48 rounded-lg border border-slate-200 bg-white">
            {loading ? <p className="px-3 py-4 text-sm text-slate-500">Searching…</p> : null}
            {!loading && search.trim().length < 2 ? (
              <p className="px-3 py-4 text-sm text-slate-500">Type to search the catalog.</p>
            ) : null}
            {!loading && search.trim().length >= 2 && results.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">No matches. Try another name or add new product.</p>
            ) : null}
            {results.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    {product.moph_code ? `MoPH ${product.moph_code}` : "No MoPH code"}
                    {product.barcode ? ` · barcode ${product.barcode}` : ""}
                    · stock {product.total_qty}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={linkingId != null}
                  onClick={() => linkToProduct(product)}
                  className="shrink-0 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {linkingId === product.id ? "Saving…" : "Link & use"}
                </button>
              </div>
            ))}
          </ScrollBox>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Barcode</span>
            <input
              readOnly
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm"
              value={barcode}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Name</span>
            <input
              ref={nameInputRef}
              required
              type="text"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Sale price (USD)</span>
            <input
              required
              type="number"
              min={0}
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Category (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create product & save barcode"}
          </button>
          <p className="text-xs text-slate-500">Receive stock afterward if you need quantity on hand.</p>
        </form>
      )}
    </div>
  );
}
