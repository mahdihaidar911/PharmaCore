import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../components/icons";
import { Pagination } from "../components/Pagination";
import { PageShell, ScrollBox } from "../components/PageShell";
import { ProductInspector } from "../components/ProductInspector";
import { ProductName } from "../components/ProductName";
import { Alert, EmptyState, SearchInput, Spinner, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, formatLbp, formatUsd, type PharmacySettings, type Product } from "../lib/api";
import { toast } from "../lib/toast";

const PAGE_SIZE = 50;

export default function ProductsPage() {
  const { can } = useAuth();
  const canManage = can("products.manage");
  const canAdjust = can("inventory.adjust");
  const [params, setParams] = useSearchParams();
  const [settings, setSettings] = useState<PharmacySettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");

  const inspectParam = params.get("product");
  const inspecting = inspectParam === "new" ? (canManage ? null : undefined) : inspectParam && /^\d+$/.test(inspectParam) ? Number(inspectParam) : undefined;

  function openProduct(id: number | "new") {
    setParams((p) => {
      p.set("product", String(id));
      return p;
    });
  }

  function closeInspector() {
    setParams((p) => {
      p.delete("product");
      return p;
    });
  }

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

  return (
    <PageShell
      title="Products"
      description="The MoPH catalogue fills names and ministry codes. Open a product to see its batches or link the box barcode so the till can scan it."
      actions={
        canManage ? (
          <button type="button" className="btn btn-primary" onClick={() => openProduct("new")}>
            <Icon name="plus" className="h-4 w-4" /> Add product
          </button>
        ) : null
      }
    >
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
            <label className="flex items-center gap-2 text-dense text-fg-2">
              <input
                type="checkbox"
                className="h-4 w-4"
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
        {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}

        <div className="sheet flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScrollBox className={`min-h-0 flex-1 ${loading ? "opacity-60" : ""}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="hidden md:table-cell">MoPH</th>
                  <th className="hidden lg:table-cell">Barcode</th>
                  <th className="num">Price</th>
                  <th className="num">On hand</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className={`cursor-pointer ${inspecting === product.id ? "is-selected" : ""}`} onClick={() => openProduct(product.id)}>
                    <td className={`w-full max-w-0 min-w-56 ${product.is_active ? "" : "opacity-60"}`}>
                      <ProductName name={product.name} />
                      {product.is_active ? null : (
                        <Status tone="muted" className="text-xs">
                          Inactive — hidden from the till
                        </Status>
                      )}
                    </td>
                    <td className="code hidden text-fg-2 md:table-cell">{product.moph_code ?? "—"}</td>
                    <td className="code hidden text-fg-2 lg:table-cell">{product.barcode ?? <span className="font-sans text-fg-4">none</span>}</td>
                    <td className="num">
                      <span className="block font-medium">{formatUsd(product.sale_price_usd)}</span>
                      <span className="block text-xs text-fg-3">{settings ? formatLbp(product.sale_price_usd * settings.exchange_rate) : ""}</span>
                    </td>
                    <td className="num whitespace-nowrap">
                      {product.total_qty > 0 ? (
                        <span className="font-medium">{product.total_qty}</span>
                      ) : (
                        <span className="text-fg-4" aria-label="None in stock">
                          —
                        </span>
                      )}
                    </td>
                    <td className="w-10 text-right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon"
                        aria-label={`Open ${product.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openProduct(product.id);
                        }}
                      >
                        <Icon name="chevronRight" className="h-4 w-4" />
                      </button>
                    </td>
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

      {inspecting !== undefined ? (
        <ProductInspector
          key={inspectParam}
          productId={inspecting}
          exchangeRate={settings?.exchange_rate ?? null}
          canManage={canManage}
          canAdjust={canAdjust}
          onClose={closeInspector}
          onSaved={(message, id) => {
            toast(message);
            if (inspecting === null) openProduct(id);
            void loadProducts();
          }}
        />
      ) : null}
    </PageShell>
  );
}
