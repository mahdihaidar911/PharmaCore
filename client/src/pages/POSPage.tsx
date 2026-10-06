import { FormEvent, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/icons";
import { LinkBarcodePanel } from "../components/LinkBarcodePanel";
import { PageShell, ScrollBox } from "../components/PageShell";
import { printReceipt } from "../components/Receipt";
import { Alert, ConfirmDialog, EmptyState, Field, Modal } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { isExactBarcodeMatch, looksLikeBarcodeScan, normalizeScan } from "../lib/barcode";
import {
  api,
  ApiError,
  formatLbp,
  formatUsd,
  parseServerDate,
  usdToLbp,
  type CartItem,
  type HeldCart,
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
  const { can } = useAuth();
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
  const [drawerOpen, setDrawerOpen] = useState<boolean | null>(null);
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [heldListOpen, setHeldListOpen] = useState(false);
  const [heldError, setHeldError] = useState("");
  const [discardId, setDiscardId] = useState<number | null>(null);

  const refreshHeld = useCallback(() => {
    api.listHeldCarts().then(setHeld).catch(() => setHeld([]));
  }, []);

  useEffect(() => {
    api
      .getCurrentShift()
      .then((cur) => setDrawerOpen(Boolean(cur.shift)))
      .catch(() => setDrawerOpen(null));
    refreshHeld();
  }, [refreshHeld]);

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
  const canDiscount = can("pos.discount");
  const discount = canDiscount ? Number(discountUsd) || 0 : 0;
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
      if (err instanceof ApiError && err.status === 409) setDrawerOpen(false);
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

  function resetPayment() {
    setDiscountUsd("0");
    setPaidUsd("");
    setPaidLbp("");
    setCheckoutError("");
  }

  async function holdCurrentSale(event: FormEvent) {
    event.preventDefault();
    setHeldError("");
    try {
      await api.holdCart({
        label: holdLabel.trim() || undefined,
        items: cart.map((item) => ({ product_id: item.product_id, qty: item.qty })),
        discount_usd: discount,
      });
      setCart([]);
      resetPayment();
      setHoldLabel("");
      setHoldOpen(false);
      setScanHint("Sale put on hold. Resume it from “Held sales”.");
      refreshHeld();
      requestAnimationFrame(() => searchRef.current?.focus());
    } catch (err) {
      setHeldError(err instanceof Error ? err.message : "Could not hold the sale");
    }
  }

  async function resumeHeld(cartToResume: HeldCart) {
    setHeldError("");
    if (cart.length > 0) {
      setHeldError("Finish or hold the current sale before resuming another one.");
      return;
    }
    try {
      const resumed = await api.resumeHeldCart(cartToResume.id);
      const notes: string[] = [];
      const items: CartItem[] = [];
      for (const item of resumed.items) {
        const qty = Math.min(item.qty, item.total_qty);
        if (qty < item.qty) notes.push(qty === 0 ? `${item.name} is out of stock and was removed` : `${item.name} reduced to ${qty} (stock)`);
        if (qty > 0) {
          items.push({
            product_id: item.product_id,
            name: item.name,
            barcode: item.barcode,
            qty,
            unit_price_usd: item.sale_price_usd,
            sale_price_usd: item.sale_price_usd,
          });
        }
      }
      setCart(items);
      resetPayment();
      if (canDiscount && resumed.discount_usd > 0) setDiscountUsd(String(resumed.discount_usd));
      setHeldListOpen(false);
      setScanHint(`Resumed${resumed.label ? ` “${resumed.label}”` : ""}.${notes.length ? ` ${notes.join("; ")}.` : ""}`);
      refreshHeld();
      requestAnimationFrame(() => searchRef.current?.focus());
    } catch (err) {
      setHeldError(err instanceof Error ? err.message : "Could not resume the sale");
      refreshHeld();
    }
  }

  async function discardHeld() {
    if (discardId === null) return;
    try {
      await api.discardHeldCart(discardId);
    } catch (err) {
      setHeldError(err instanceof Error ? err.message : "Could not discard the sale");
    } finally {
      setDiscardId(null);
      refreshHeld();
    }
  }

  const showSearchError = Boolean(searchError) && normalizeScan(query).length > 0;

  return (
    <PageShell
      title="POS"
      description="Scan to sell. Unknown barcode? Search the catalog to link it, or add a new product — barcodes build up as you work."
    >
      <div className="grid min-h-0 flex-1 gap-4 overflow-auto lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
          {drawerOpen === false ? (
            <Alert tone="warning" title="The cash drawer is closed">
              Open a shift before completing sales.{" "}
              <Link to="/cash" className="font-medium underline">
                Go to Cash drawer
              </Link>
            </Alert>
          ) : null}
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
                  if (active?.closest('[role="dialog"]')) return;
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

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">
              Cart{cart.length ? ` · ${cart.reduce((n, i) => n + i.qty, 0)} item(s)` : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={cart.length === 0}
                onClick={() => {
                  setHeldError("");
                  setHoldOpen(true);
                }}
              >
                <Icon name="pause" className="h-4 w-4" /> Hold sale
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setHeldError("");
                  refreshHeld();
                  setHeldListOpen(true);
                }}
              >
                Held sales{held.length ? <span className="badge badge-brand ml-1">{held.length}</span> : null}
              </button>
            </div>
          </div>

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

        <ScrollBox className="min-h-0 rounded-xl border border-slate-200 bg-white lg:max-h-full">
        <form onSubmit={handleCheckout} className="p-5">
          <h3 className="text-lg font-semibold text-slate-900">Payment</h3>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span>{formatUsd(subtotalUsd)}</span>
            </div>
            {canDiscount ? (
              <label className="block">
                <span className="text-slate-500">Discount (USD)</span>
                <input
                  type="number"
                  min={0}
                  max={subtotalUsd}
                  step="0.01"
                  className={`input mt-1 ${discount > subtotalUsd ? "input-invalid" : ""}`}
                  value={discountUsd}
                  onChange={(e) => {
                    setCheckoutError("");
                    setDiscountUsd(e.target.value);
                  }}
                />
                {discount > subtotalUsd ? <span className="mt-1 block text-xs text-red-600">Discount cannot exceed the subtotal.</span> : null}
              </label>
            ) : null}
            <div className="mt-2 rounded-xl bg-slate-900 px-4 py-3 text-white">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-300">Total</span>
                <span className="text-3xl font-semibold tabular-nums">{formatUsd(totalUsd)}</span>
              </div>
              <p className="text-right text-sm text-slate-300 tabular-nums">{formatLbp(totalLbp)}</p>
            </div>
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
                <option value="mixed">Mixed cash (USD + LBP)</option>
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
            disabled={checkingOut || cart.length === 0 || insufficient || discount > subtotalUsd || drawerOpen === false}
            className="btn btn-primary btn-lg mt-5 w-full"
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

      <Modal
        open={holdOpen}
        title="Hold this sale"
        size="sm"
        onClose={() => setHoldOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setHoldOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="hold-form" className="btn btn-primary">
              Hold sale
            </button>
          </>
        }
      >
        <form id="hold-form" onSubmit={holdCurrentSale} className="space-y-3">
          <Field label="Label (optional)" hint="Helps find it later, e.g. the customer's name. Stock is not reserved while on hold.">
            <input className="input" maxLength={60} value={holdLabel} onChange={(e) => setHoldLabel(e.target.value)} />
          </Field>
          {heldError ? <Alert tone="error">{heldError}</Alert> : null}
        </form>
      </Modal>

      <Modal open={heldListOpen} title="Held sales" onClose={() => setHeldListOpen(false)}>
        {heldError ? <Alert tone="error" className="mb-3">{heldError}</Alert> : null}
        {held.length === 0 ? (
          <EmptyState title="No held sales" description="Use “Hold sale” to park a cart while you serve another customer." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {held.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{h.label || `Sale on hold #${h.id}`}</p>
                  <p className="text-xs text-slate-500">
                    {parseServerDate(h.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {h.held_by} ·{" "}
                    {h.items.reduce((n, i) => n + i.qty, 0)} item(s) · {formatUsd(h.subtotal_usd)}
                  </p>
                  <p className="truncate text-xs text-slate-500">{h.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
                  {h.items.some((i) => !i.available) ? <p className="text-xs text-amber-700">Some items no longer have enough stock.</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDiscardId(h.id)}>
                    Discard
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => resumeHeld(h)}>
                    Resume
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={discardId !== null}
        title="Discard held sale?"
        message="The held cart will be deleted. No stock or money is affected."
        confirmLabel="Discard"
        destructive
        onConfirm={discardHeld}
        onCancel={() => setDiscardId(null)}
      />
    </PageShell>
  );
}
