import { FormEvent, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/icons";
import { LinkBarcodePanel } from "../components/LinkBarcodePanel";
import { BillPanel, type PaymentMethod } from "../components/pos/BillPanel";
import { CartLines } from "../components/pos/CartLines";
import { ScanResults } from "../components/pos/ScanResults";
import Receipt, { printReceipt } from "../components/Receipt";
import { ConfirmDialog, EmptyState, Field, Modal, Alert, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { isExactBarcodeMatch, looksLikeBarcodeScan, normalizeScan } from "../lib/barcode";
import {
  api,
  ApiError,
  formatUsd,
  parseServerDate,
  usdToLbp,
  type CartItem,
  type HeldCart,
  type PosProduct,
  type SaleDetail,
} from "../lib/api";
import { computeChange } from "../lib/payment";
import { notifyDrawerChanged } from "../lib/shellEvents";
import { toast } from "../lib/toast";
import { splitProductName } from "../lib/productName";

const FOCUS_KEY = "pharmacore_pos_focus";

const isTypingTarget = (el: Element | null) => Boolean(el?.closest("input, select, textarea, [data-pos-link-panel], [role='dialog']"));

export default function POSPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const searchSeq = useRef(0);
  const scanIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingScan = useRef(false);
  const { settings } = useSettings();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastAddedId, setLastAddedId] = useState<number | null>(null);
  const [discountUsd, setDiscountUsd] = useState("0");
  const [paidUsd, setPaidUsd] = useState("");
  const [paidLbp, setPaidLbp] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [searchError, setSearchError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const checkoutInFlight = useRef(false);
  const [scanHint, setScanHint] = useState("");
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean | null>(null);
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [heldListOpen, setHeldListOpen] = useState(false);
  const [heldError, setHeldError] = useState("");
  const [discardId, setDiscardId] = useState<number | null>(null);

  const [focusMode, setFocusMode] = useState(() => localStorage.getItem(FOCUS_KEY) === "on");

  const focusSearch = useCallback(() => requestAnimationFrame(() => searchRef.current?.focus()), []);

  function toggleFocusMode() {
    setFocusMode((on) => {
      localStorage.setItem(FOCUS_KEY, on ? "off" : "on");
      return !on;
    });
    focusSearch();
  }

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
      setActiveIndex(-1);
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
        setActiveIndex(-1);
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
  const unitCount = cart.reduce((n, i) => n + i.qty, 0);

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
          item.product_id === product.id ? { ...item, qty: item.qty + qty, stock: product.total_qty } : item,
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
          stock: product.total_qty,
        },
      ];
    });
    setLastAddedId(product.id);
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
    setPendingBarcode(null);
    focusSearch();
  }

  function handleBarcodeLinked(product: PosProduct) {
    setPendingBarcode(null);
    setSearchError("");
    if (product.total_qty > 0) {
      addToCart(product);
      setScanHint(`Linked and added: ${product.name}`);
    } else {
      setScanHint(`Barcode saved for ${product.name}. Receive stock before selling.`);
      focusSearch();
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

  function moveActive(step: number) {
    if (results.length === 0) return;
    setActiveIndex((i) => {
      let next = i;
      for (let n = 0; n < results.length; n++) {
        next = (next + step + results.length) % results.length;
        if (results[next].total_qty > 0) return next;
      }
      return i;
    });
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setResults([]);
      setActiveIndex(-1);
      setSearchError("");
      return;
    }
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();
    if (scanIdleRef.current) {
      clearTimeout(scanIdleRef.current);
      scanIdleRef.current = null;
    }
    const picked = activeIndex >= 0 ? results[activeIndex] : undefined;
    if (picked && picked.total_qty > 0) {
      addToCart(picked);
      setScanHint(`Added: ${picked.name}`);
      return;
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
    if (cart.length === 0) return;
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
    if (checkoutInFlight.current) return;
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

    checkoutInFlight.current = true;
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
      toast(`Sale #${detail.sale.id} completed · ${formatUsd(detail.sale.total_usd)}`);
      setCart([]);
      setLastAddedId(null);
      setDiscountUsd("0");
      setPaidUsd("");
      setPaidLbp("");
      setSearchError("");
      printReceipt(detail);
      focusSearch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      if (err instanceof ApiError && err.status === 409) {
        setDrawerOpen(false);
        notifyDrawerChanged();
      }
      if (message === "Not found") {
        setCheckoutError(
          "Checkout API not available. Close every terminal, open a new one in PharmaCore folder, run: npm run dev",
        );
      } else if (message.includes("Insufficient payment") || message.includes("Payment mismatch")) {
        setCheckoutError(`${message} Use “Exact” (F7 / F8) to match the total.`);
      } else {
        setCheckoutError(message);
      }
    } finally {
      checkoutInFlight.current = false;
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
      setLastAddedId(null);
      resetPayment();
      setHoldLabel("");
      setHoldOpen(false);
      setScanHint("Sale put on hold. Resume it from “Held sales”.");
      refreshHeld();
      focusSearch();
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
            stock: item.total_qty,
          });
        }
      }
      setCart(items);
      setLastAddedId(null);
      resetPayment();
      if (canDiscount && resumed.discount_usd > 0) setDiscountUsd(String(resumed.discount_usd));
      setHeldListOpen(false);
      setScanHint(`Resumed${resumed.label ? ` “${resumed.label}”` : ""}.${notes.length ? ` ${notes.join("; ")}.` : ""}`);
      refreshHeld();
      focusSearch();
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

  function openHold() {
    if (cart.length === 0) return;
    setHeldError("");
    setHoldOpen(true);
  }

  function closeHold() {
    setHoldOpen(false);
    focusSearch();
  }

  function openHeldList() {
    setHeldError("");
    refreshHeld();
    setHeldListOpen(true);
  }

  // Till shortcuts. A ref keeps one listener while always calling the latest handlers.
  const shortcutRef = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e) => {
    if (document.querySelector('[role="dialog"]')) return;
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
      return;
    }
    const actions: Record<string, () => void> = {
      F2: () => {
        searchRef.current?.focus();
        searchRef.current?.select();
      },
      F3: openHeldList,
      F4: openHold,
      F7: () => fillExactPayment("usd"),
      F8: () => fillExactPayment("lbp"),
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showSearchError = Boolean(searchError) && (normalizeScan(query).length > 0 || !results.length);
  const showResults = results.length > 0 && !pendingBarcode;

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${
        focusMode ? "scope-graphite -mx-4 -mt-4 -mb-4 bg-canvas px-4 pt-4 pb-4 text-fg lg:-mx-6 lg:-mt-5 lg:rounded-tl-xl lg:px-6 lg:pt-5" : ""
      }`}
    >
      <h1 className="sr-only">Point of sale</h1>
      <div className="grid min-h-0 flex-1 gap-5 overflow-x-hidden overflow-y-auto max-lg:auto-rows-max lg:grid-cols-[minmax(0,1fr)_350px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-h-0 flex-col gap-2.5" aria-label="Current sale">
          <div className="relative shrink-0">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <label htmlFor="pos-scan" className="kicker">
                Scan or search
              </label>
              <span className="flex items-center gap-3">
                {pendingBarcode ? null : searchFocused ? (
                  <span className="flex items-center gap-2 text-xs font-medium text-fg-2">
                    <span className="signal" aria-hidden /> Scanner ready
                  </span>
                ) : (
                  <button type="button" className="flex items-center gap-2 text-xs font-medium text-caution hover:underline" onClick={() => searchRef.current?.focus()}>
                    <span className="signal signal-caution" aria-hidden /> Click here or press <span className="kbd">F2</span> before scanning
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm -mr-2 text-xs"
                  aria-pressed={focusMode}
                  title="Dark till workspace for the counter, independent of the app theme"
                  onClick={toggleFocusMode}
                >
                  <Icon name="moon" className="h-3.5 w-3.5" /> Focus
                </button>
              </span>
            </div>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-fg-3" />
              <input
                id="pos-scan"
                ref={searchRef}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={Boolean(pendingBarcode)}
                role="combobox"
                aria-expanded={showResults}
                aria-controls="pos-results"
                aria-activedescendant={activeIndex >= 0 && results[activeIndex] ? `pos-result-${results[activeIndex].id}` : undefined}
                className="input input-lg min-h-14 border-line-strong pl-12 text-lg shadow-raised focus:border-accent focus:shadow-[0_0_0_4px_var(--c-accent-soft)] xl:pr-64"
                placeholder={pendingBarcode ? "Link the scanned barcode below first…" : "Scan a barcode, or type a product name"}
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  setSearchFocused(false);
                  if (pendingBarcode) return;
                  requestAnimationFrame(() => {
                    if (isTypingTarget(document.activeElement)) return;
                    searchRef.current?.focus();
                  });
                }}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 text-xs text-fg-3 xl:block">
                <span className="kbd">↑</span> <span className="kbd">↓</span> choose · <span className="kbd">Enter</span> add · <span className="kbd">Esc</span> clear
              </span>
            </div>
            {showResults ? (
              <ScanResults
                results={results}
                activeIndex={activeIndex}
                rate={rate}
                onPick={(p) => {
                  addToCart(p);
                  setScanHint(`Added: ${p.name}`);
                }}
                onHover={setActiveIndex}
              />
            ) : null}
          </div>

          <div className="min-h-5 shrink-0 text-dense" aria-live="polite">
            {showSearchError && !pendingBarcode ? (
              <Status tone="caution" icon="alert">
                {searchError}
              </Status>
            ) : scanHint ? (
              <Status tone="ok">{scanHint}</Status>
            ) : null}
          </div>

          {pendingBarcode ? (
            <LinkBarcodePanel
              barcode={pendingBarcode}
              onLinked={handleBarcodeLinked}
              onCancel={() => {
                setPendingBarcode(null);
                setScanHint("");
                focusSearch();
              }}
            />
          ) : null}

          <div className="sheet flex min-h-[16rem] flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <p className="flex items-baseline gap-2.5 text-dense text-fg-3">
                <span className="text-sm font-semibold text-fg">Current sale</span>
                {cart.length ? (
                  <span>
                    {cart.length} {cart.length === 1 ? "line" : "lines"} · {unitCount} {unitCount === 1 ? "unit" : "units"}
                  </span>
                ) : null}
              </p>
              <div className="flex gap-1.5">
                <button type="button" className="btn btn-secondary btn-sm" disabled={cart.length === 0} onClick={openHold}>
                  <Icon name="pause" className="h-3.5 w-3.5" /> Hold <span className="kbd">F4</span>
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={openHeldList}>
                  Held sales
                  {held.length ? <span className="rounded-xs bg-accent px-1.5 text-xs leading-[18px] font-semibold text-accent-fg">{held.length}</span> : null}
                  <span className="kbd">F3</span>
                </button>
              </div>
            </div>
            <div className="@container min-h-0 flex-1 overflow-auto">
              <CartLines cart={cart} lastAddedId={lastAddedId} onQty={updateCartQty} onRemove={(id) => updateCartQty(id, 0)} />
            </div>
          </div>
        </section>

        <aside className="scope-graphite min-h-0 overflow-auto rounded-lg border border-frame-line bg-canvas text-fg shadow-overlay" aria-label="Checkout">
          <BillPanel
            formRef={formRef}
            onSubmit={handleCheckout}
            subtotalUsd={subtotalUsd}
            canDiscount={canDiscount}
            discountUsd={discountUsd}
            discountInvalid={discount > subtotalUsd}
            onDiscount={(v) => {
              setCheckoutError("");
              setDiscountUsd(v);
            }}
            totalUsd={totalUsd}
            totalLbp={totalLbp}
            rate={rate}
            paymentMethod={paymentMethod}
            onPaymentMethod={setPaymentMethod}
            paidUsd={paidUsd}
            paidLbp={paidLbp}
            onPaidUsd={(v) => {
              setCheckoutError("");
              setPaidUsd(v);
            }}
            onPaidLbp={(v) => {
              setCheckoutError("");
              setPaidLbp(v);
            }}
            onExact={fillExactPayment}
            tendered={paidUsdNum > 0 || paidLbpNum > 0}
            insufficient={insufficient}
            dueUsd={Math.max(0, totalUsd - paidEquivalent)}
            change={change}
            checkoutError={checkoutError}
            checkingOut={checkingOut}
            cartEmpty={cart.length === 0}
            drawerOpen={drawerOpen}
            lastSale={lastSale}
            onReprint={() => lastSale && printReceipt(lastSale)}
            onPreview={() => setPreviewOpen(true)}
          />
        </aside>
      </div>

      <Modal
        open={holdOpen}
        title="Hold this sale"
        size="sm"
        onClose={closeHold}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeHold}>
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

      <Modal
        open={heldListOpen}
        title="Held sales"
        onClose={() => {
          setHeldListOpen(false);
          focusSearch();
        }}
      >
        {heldError ? <Alert tone="error" className="mb-3">{heldError}</Alert> : null}
        {held.length === 0 ? (
          <EmptyState title="No held sales" description="Use “Hold sale” (F4) to park a cart while you serve another customer." />
        ) : (
          <ul className="divide-y divide-line">
            {held.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{h.label || `Sale on hold #${h.id}`}</p>
                  <p className="meta">
                    {parseServerDate(h.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {h.held_by} ·{" "}
                    {h.items.reduce((n, i) => n + i.qty, 0)} unit(s) · {formatUsd(h.subtotal_usd)}
                  </p>
                  <p className="truncate text-xs text-fg-3">{h.items.map((i) => `${i.qty}× ${splitProductName(i.name).title}`).join(", ")}</p>
                  {h.items.some((i) => !i.available) ? (
                    <Status tone="caution" icon="alert" className="text-xs">
                      Some items no longer have enough stock
                    </Status>
                  ) : null}
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

      <Modal open={previewOpen && Boolean(lastSale)} title={lastSale ? `Receipt — sale #${lastSale.sale.id}` : "Receipt"} size="lg" onClose={() => setPreviewOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPreviewOpen(false)}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={() => lastSale && printReceipt(lastSale)}>
              <Icon name="printer" className="h-4 w-4" /> Print
            </button>
          </>
        }
      >
        {lastSale ? <Receipt detail={lastSale} /> : null}
      </Modal>
    </div>
  );
}
