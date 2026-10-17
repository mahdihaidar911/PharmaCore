import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatUsd, type Product } from "../lib/api";
import { splitProductName } from "../lib/productName";
import { Icon, type IconName } from "./icons";

export type PaletteItem = { to: string; label: string; group: string; icon: IconName };

type Row = { key: string; to: string; kind: "page"; item: PaletteItem } | { key: string; to: string; kind: "product"; product: Product };

/** Ctrl K: jump to any page the role can open, or find a product and open its details. */
export function CommandPalette({ items, open, onClose }: { items: PaletteItem[]; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canProducts = can("products.view");
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    const q = query.trim();
    if (!open || !canProducts || q.length < 2) {
      setProducts([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .getProducts({ search: q, pageSize: 6 })
        .then((r) => !cancelled && setProducts(r.items))
        .catch(() => !cancelled && setProducts([]))
        .finally(() => !cancelled && setSearching(false));
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, canProducts]);

  const rows: Row[] = useMemo(
    () => [
      ...pages.map((item) => ({ key: `page-${item.to}`, to: item.to, kind: "page" as const, item })),
      ...products.map((product) => ({ key: `product-${product.id}`, to: `/products?product=${product.id}`, kind: "product" as const, product })),
    ],
    [pages, products],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const returnTo = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      if (returnTo && document.contains(returnTo)) returnTo.focus();
    };
  }, [open]);

  useEffect(() => setIndex(0), [query, products.length]);

  if (!open) return null;

  const go = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    navigate(row.to);
  };

  const rowClass = (i: number) =>
    `flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 text-sm ${i === index ? "bg-accent-soft text-fg" : "text-fg-2"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to a page or find a product"
        className="w-full max-w-lg animate-enter overflow-hidden rounded-lg border border-line-strong bg-surface text-fg shadow-overlay"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5">
          <Icon name="search" className="h-4 w-4 text-fg-3" />
          <input
            ref={inputRef}
            className="min-h-12 w-full bg-transparent text-base text-fg placeholder:text-fg-3 focus:outline-none"
            placeholder={canProducts ? "Page name, product name, barcode or MoPH code" : "Page name"}
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[index] ? `palette-${rows[index].key}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(rows[index]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[60vh] overflow-auto p-1.5">
          {pages.length > 0 ? <li className="kicker px-2.5 pt-1.5 pb-1" role="presentation">Pages</li> : null}
          {rows.map((row, i) =>
            row.kind === "page" ? (
              <li key={row.key} id={`palette-${row.key}`} role="option" aria-selected={i === index} className={rowClass(i)} onMouseEnter={() => setIndex(i)} onClick={() => go(row)}>
                <Icon name={row.item.icon} className="h-4 w-4 text-fg-3" />
                <span className="flex-1">{row.item.label}</span>
                <span className="meta">{row.item.group}</span>
              </li>
            ) : (
              <ProductRow key={row.key} id={`palette-${row.key}`} product={row.product} selected={i === index} className={rowClass(i)} first={i === pages.length} onHover={() => setIndex(i)} onPick={() => go(row)} />
            ),
          )}
          {searching ? <li className="px-2.5 py-2 text-dense text-fg-3">Searching products…</li> : null}
          {rows.length === 0 && !searching ? <li className="px-2.5 py-3 text-sm text-fg-3">Nothing matches “{query}”.</li> : null}
        </ul>
      </div>
    </div>
  );
}

function ProductRow({
  id,
  product,
  selected,
  className,
  first,
  onHover,
  onPick,
}: {
  id: string;
  product: Product;
  selected: boolean;
  className: string;
  first: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const { title, form } = splitProductName(product.name);
  return (
    <>
      {first ? (
        <li className="kicker px-2.5 pt-2.5 pb-1" role="presentation">
          Products
        </li>
      ) : null}
      <li id={id} role="option" aria-selected={selected} className={className} onMouseEnter={onHover} onClick={onPick}>
        <Icon name="products" className="h-4 w-4 text-fg-3" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{title}</span>
          <span className="block truncate text-xs text-fg-3">
            {form ? `${form} · ` : ""}
            {product.moph_code ? `MoPH ${product.moph_code}` : "No MoPH code"}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-dense font-medium">{formatUsd(product.sale_price_usd)}</span>
          <span className={`block text-xs ${product.total_qty > 0 ? "text-fg-3" : "text-caution"}`}>{product.total_qty > 0 ? `${product.total_qty} in stock` : "No stock"}</span>
        </span>
      </li>
    </>
  );
}
