import { FormEvent, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LinkBarcodePanel } from "../components/LinkBarcodePanel";
import { PageShell, ScrollBox } from "../components/PageShell";
import { printReceipt } from "../components/Receipt";
import { useSettings } from "../context/SettingsContext";
import { isExactBarcodeMatch, looksLikeBarcodeScan, normalizeScan } from "../lib/barcode";
import {
  api,
  formatLbp,
  formatUsd,
  usdToLbp,
  type CartItem,
  type PosProduct,
  type SaleDetail,
} from "../lib/api";
import { computeChange } from "../lib/payment";

export default function POSPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);
  const scanIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingScan = useRef(false);
  const { settings } = useSettings();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountUsd, setDiscountUsd] = useState("0");
  const [paidUsd, setPaidUsd] = useState("");
  const [paidLbp, setPaidLbp] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mixed">("cash");
  const [searchError, setSearchError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [scanHint, setScanHint] = useState("");
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = normalizeScan(q);
    const seq = ++searchSeq.current;

    if (!trimmed) {
      if (seq === searchSeq.current) {
        setResults([]);
        setSearchError("");
      }
      return;
    }

    try {
      const found = await api.searchPos(trimmed);
      if (seq !== searchSeq.current) return;
      setResults(found);
      setSearchError(found.length === 0 ? `No product found for "${trimmed}".` : "");
    } catch (err) {
      if (seq !== searchSeq.current) return;
      const message = err instanceof Error ? err.message : "Search failed";
      try {
        const fallback = await api.getProducts({ search: trimmed, pageSize: 50 });
        if (seq !== searchSeq.current) return;
        const mapped: PosProduct[] = fallback.items.map((p) => ({
          id: p.id,
          barcode: p.barcode,
          name: p.name,
          category: p.category,
          sale_price_usd: p.sale_price_usd,
          total_qty: p.total_qty,
        }));
        setResults(mapped);
        setSearchError(mapped.length === 0 ? `No product found for "${trimmed}".` : "");
      } catch {
        if (seq !== searchSeq.current) return;
        setSearchError(message);
        setResults([]);
      }
    }
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
    api.getHealth().then((health) => {
      if (!health.features?.checkout) {
        setCheckoutError("Server is outdated. Stop all terminals, then run: npm run dev");
      }
    }).catch(() => {
      setCheckoutError("Cannot reach API on port 4000. Run: npm run dev");
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const rate = settings?.exchange_rate ?? 89500;
  const subtotalUsd = cart.reduce((sum, item) => sum + item.unit_price_usd * item.qty, 0);
  const discount = Number(discountUsd) || 0;
  const totalUsd = Math.max(0, subtotalUsd - discount);
  const totalLbp = usdToLbp(totalUsd, rate);
  const paidUsdNum = Number(paidUsd) || 0;
  const paidLbpNum = Number(paidLbp) || 0;
  const paidEquivalent = paidUsdNum + paidLbpNum / rate;
  const change = computeChange(totalUsd, paidUsdNum, paidLbpNum, rate);
  const insufficient =
    cart.length > 0 && (paidUsdNum > 0 || paidLbpNum > 0) && paidEquivalent + 0.02 < totalUsd;

  function addToCart(product: PosProduct, qty = 1) {
    if (product.total_qty < qty) {
      setSearchError(`${product.name} has only ${product.total_qty} in stock. Receive stock first.`);
      setScanHint("");
      return;
    }
    setSearchError("");
    setScanHint("");
    setCheckoutError("");
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.id ? { ...item, qty: item.qty + qty } : item,
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          barcode: product.barcode,
          qty,
          unit_price_usd: product.sale_price_usd,
          sale_price_usd: product.sale_price_usd,
        },
      ];
    });
    setQuery("");
    setResults([]);
    setPendingBarcode(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function handleBarcodeLinked(product: PosProduct) {
    setPendingBarcode(null);
    setSearchError("");
    if (product.total_qty > 0) {
      addToCart(product);
      setScanHint(`Linked & added: ${product.name}`);
    } else {
      setScanHint(`Barcode saved for ${product.name}. Receive stock before selling.`);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }

  async function resolvePosSearch(trimmed: string): Promise<PosProduct[]> {
    try {
      return await api.searchPos(trimmed);
    } catch {
      const fallback = await api.getProducts({ search: trimmed, pageSize: 50 });
      return fallback.items.map((p) => ({
        id: p.id,
        barcode: p.barcode,
        name: p.name,
        category: p.category,
        sale_price_usd: p.sale_price_usd,
        total_qty: p.total_qty,
      }));
    }
  }

  const submitScan = useCallback(async (raw: string) => {
    const trimmed = normalizeScan(raw);
    if (!trimmed || processingScan.current) return;

    processingScan.current = true;
    const seq = ++searchSeq.current;

    try {
      const found = await resolvePosSearch(trimmed);
      if (seq !== searchSeq.current) return;

      const isBarcode = looksLikeBarcodeScan(trimmed);
      const exact = found.find((p) => isExactBarcodeMatch(p.barcode, trimmed));

      if (exact) {
        setQuery("");
        setResults([]);
        if (exact.total_qty > 0) {
          addToCart(exact);
          setScanHint(`Added: ${exact.name}`);
        } else {
          setSearchError(`${exact.name} is out of stock. Receive stock before selling.`);
          setScanHint("");
        }
        return;
      }

      if (isBarcode) {
        setQuery("");
        setResults([]);
        setSearchError("");
        setPendingBarcode(trimmed);
        setScanHint("");
        return;
      }

      setResults(found);
      setQuery(trimmed);

      if (found.length === 0) {
        setSearchError(
          trimmed.length < 2
            ? "Type at least 2 characters to search by name."
            : `No product found for "${trimmed}".`,
        );
        setScanHint("");
        return;
      }

      const match = found.find((p) => p.total_qty > 0);
      if (!match) {
        setSearchError(`${found[0].name} is out of stock. Receive stock before selling.`);
        setScanHint("");
        return;
      }

      addToCart(match);
      setScanHint(`Added: ${match.name}`);
    } catch (err) {
      if (seq === searchSeq.current) {
        setSearchError(err instanceof Error ? err.message : "Scan failed");
      }
    } finally {
      processingScan.current = false;
    }
  }, []);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();
    if (scanIdleRef.current) {
      clearTimeout(scanIdleRef.current);
      scanIdleRef.current = null;
    }
    void submitScan(event.currentTarget.value);
  }

  function handleSearchChange(value: string) {
    setSearchError("");
    setScanHint("");
    setQuery(value);

    if (scanIdleRef.current) clearTimeout(scanIdleRef.current);
    const trimmed = normalizeScan(value);
    if (!looksLikeBarcodeScan(trimmed)) return;

    scanIdleRef.current = setTimeout(() => {
      scanIdleRef.current = null;
      void submitScan(value);
    }, 150);
  }

  function updateCartQty(productId: number, qty: number) {
    setCheckoutError("");
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.product_id !== productId));
      return;
    }
    setCart((prev) => prev.map((item) => (item.product_id === productId ? { ...item, qty } : item)));
  }

  function fillExactPayment(method: "usd" | "lbp") {
    setCheckoutError("");
    if (method === "usd") {
      setPaidUsd(totalUsd.toFixed(2));
      setPaidLbp("0");
    } else {
      setPaidUsd("0");
      setPaidLbp(String(totalLbp));
    }
    setPaymentMethod("cash");
  }

  async function handleCheckout(event: FormEvent) {
    event.preventDefault();
    if (cart.length === 0) {
      setCheckoutError("Cart is empty");
      return;
    }

    if (paidUsdNum <= 0 && paidLbpNum <= 0) {
      setCheckoutError("Enter how much the customer paid (USD and/or LBP).");
      return;
    }

    if (insufficient) {
      setCheckoutError(
        `Customer paid ${formatUsd(paidEquivalent)} equivalent. Total is ${formatUsd(totalUsd)} — need ${formatUsd(totalUsd - paidEquivalent)} more.`,
      );
      return;
    }

    setCheckingOut(true);
    setCheckoutError("");

    try {
      const detail = await api.checkout({
        items: cart.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          unit_price_usd: item.unit_price_usd,
        })),
        discount_usd: discount,
        paid_usd: paidUsdNum,
        paid_lbp: paidLbpNum,
        payment_method: paymentMethod,
      });

      setLastSale(detail);
      setCart([]);
      setDiscountUsd("0");
      setPaidUsd("");
      setPaidLbp("");
      setSearchError("");
      printReceipt(detail);
      requestAnimationFrame(() => searchRef.current?.focus());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      if (message === "Not found") {
        setCheckoutError(
          "Checkout API not available. Close every terminal, open a new one in PharmaCore folder, run: npm run dev",
        );
      } else if (message.includes("Insufficient payment") || message.includes("Payment mismatch")) {
        setCheckoutError(`${message} Click "Pay USD" or "Pay LBP" to match the total.`);
      } else {
        setCheckoutError(message);
      }
    } finally {
      setCheckingOut(false);
    }
  }

  const showSearchError = Boolean(searchError) && normalizeScan(query).length > 0;

  return (
    <PageShell
      title="POS"
      description="Scan to sell. Unknown barcode? Search the catalog to link it, or add a new product — barcodes build up as you work."
    >
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[1fr_380px]">
        <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-teal-800">Scan here (keyboard scanner)</span>
            <input
              ref={searchRef}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={Boolean(pendingBarcode)}
              className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-lg shadow-sm ${
                pendingBarcode
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  : "border-teal-500 focus:border-teal-600 focus:ring-2 focus:ring-teal-200"
              }`}
              placeholder={
                pendingBarcode ? "Link barcode below first…" : "Scan barcode or search name…"
              }
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onBlur={() => {
                if (pendingBarcode) return;
                requestAnimationFrame(() => {
                  const active = document.activeElement;
                  if (active?.closest("[data-pos-link-panel]")) return;
                  if (active?.closest("form")) return;
                  searchRef.current?.focus();
                });
              }}
            />
          </label>

          {pendingBarcode ? (
            <LinkBarcodePanel
              barcode={pendingBarcode}
              onLinked={handleBarcodeLinked}
              onCancel={() => {
                setPendingBarcode(null);
                setScanHint("");
                requestAnimationFrame(() => searchRef.current?.focus());
              }}
            />
          ) : null}

          {scanHint ? <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{scanHint}</p> : null}

          {showSearchError && !pendingBarcode ? (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{searchError}</p>
          ) : null}

          {results.length > 0 ? (
            <ScrollBox className="max-h-40 shrink-0 rounded-xl border border-slate-200 bg-white">
              {results.map((product) => {
                const outOfStock = product.total_qty <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => addToCart(product)}
                    className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 ${
                      outOfStock ? "cursor-not-allowed bg-slate-50 opacity-60" : "hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">
                        {product.barcode ?? "No barcode"} ·{" "}
                        {outOfStock ? (
                          <span className="text-red-600">Out of stock</span>
                        ) : (
                          <>Stock: {product.total_qty}</>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatUsd(product.sale_price_usd)}</p>
                      <p className="text-xs text-slate-500">{formatLbp(usdToLbp(product.sale_price_usd, rate))}</p>
                    </div>
                  </button>
                );
              })}
            </ScrollBox>
          ) : null}

          <ScrollBox className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Item</th>
                  <th className="px-4 py-3 text-left font-medium">Qty</th>
                  <th className="px-4 py-3 text-left font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.product_id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        className="w-16 rounded border border-slate-300 px-2 py-1"
                        value={item.qty}
                        onChange={(e) => updateCartQty(item.product_id, Number(e.target.value))}
                      />
                    </td>
                    <td className="px-4 py-3">{formatUsd(item.unit_price_usd)}</td>
                    <td className="px-4 py-3 text-right">{formatUsd(item.unit_price_usd * item.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cart.length === 0 ? <p className="px-4 py-8 text-center text-slate-500">Cart is empty</p> : null}
          </ScrollBox>
        </section>

        <ScrollBox className="min-h-0 rounded-xl border border-slate-200 bg-white xl:max-h-full">
        <form onSubmit={handleCheckout} className="p-5">
          <h3 className="text-lg font-semibold text-slate-900">Payment</h3>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span>{formatUsd(subtotalUsd)}</span>
            </div>
            <label className="block">
              <span className="text-slate-500">Discount (USD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={discountUsd}
                onChange={(e) => {
                  setCheckoutError("");
                  setDiscountUsd(e.target.value);
                }}
              />
            </label>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatUsd(totalUsd)}</span>
            </div>
            <p className="text-right text-slate-500">{formatLbp(totalLbp)}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fillExactPayment("usd")}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium"
            >
              Exact USD
            </button>
            <button
              type="button"
              onClick={() => fillExactPayment("lbp")}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium"
            >
              Exact LBP
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-slate-600">Customer paid (USD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={paidUsd}
                onChange={(e) => {
                  setCheckoutError("");
                  setPaidUsd(e.target.value);
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Customer paid (LBP)</span>
              <input
                type="number"
                min={0}
                step="1"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={paidLbp}
                onChange={(e) => {
                  setCheckoutError("");
                  setPaidLbp(e.target.value);
                }}
              />
            </label>
            <label className="block text-sm">
              Payment method
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "cash" | "card" | "mixed")}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>
          </div>

          {(paidUsdNum > 0 || paidLbpNum > 0) && cart.length > 0 ? (
            <div
              className={`mt-4 rounded-lg p-3 text-sm ${
                insufficient
                  ? "bg-red-50 text-red-800"
                  : change.hasChange
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-slate-50 text-slate-700"
              }`}
            >
              {insufficient ? (
                <p>
                  <span className="font-medium">Still due:</span> {formatUsd(totalUsd - paidEquivalent)} (
                  {formatLbp(usdToLbp(totalUsd - paidEquivalent, rate))})
                </p>
              ) : change.hasChange ? (
                <>
                  <p className="font-semibold">Change to return</p>
                  {change.changeUsd > 0 ? <p className="mt-1">{formatUsd(change.changeUsd)}</p> : null}
                  {change.changeLbp > 0 ? <p className="mt-1">{formatLbp(change.changeLbp)}</p> : null}
                  {change.changeUsd > 0 && change.changeLbp > 0 ? (
                    <p className="mt-1 text-xs opacity-80">Return USD and/or LBP as appropriate.</p>
                  ) : null}
                </>
              ) : (
                <p className="font-medium">Exact payment — no change</p>
              )}
            </div>
          ) : null}

          {checkoutError ? <p className="mt-3 text-sm text-red-600">{checkoutError}</p> : null}

          <button
            type="submit"
            disabled={checkingOut || cart.length === 0 || insufficient}
            className="mt-5 w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {checkingOut ? "Processing..." : "Complete sale & print"}
          </button>

          {lastSale ? (
            <button
              type="button"
              className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm"
              onClick={() => printReceipt(lastSale)}
            >
              Reprint last receipt (#{lastSale.sale.id})
            </button>
          ) : null}
        </form>
        </ScrollBox>
      </div>
    </PageShell>
  );
}
