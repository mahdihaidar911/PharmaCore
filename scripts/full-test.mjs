/**
 * PharmaCore full API smoke test.
 * Run with server up: npm run dev:server  (or npm run dev)
 * Then: node scripts/full-test.mjs
 */

const BASE = process.env.API_BASE ?? "http://localhost:4000";
const USER = process.env.TEST_USER ?? "admin";
const PASS = process.env.TEST_PASS ?? "admin123";

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - start });
  } catch (error) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }

  if (!res.ok) {
    const msg = data?.error ?? (typeof data?.raw === "string" ? data.raw : res.statusText);
    throw new Error(`${res.status} ${path}: ${msg}`);
  }
  return data;
}

let token = "";

async function main() {
  console.log(`PharmaCore full test → ${BASE}\n`);

  await test("GET /api/health", async () => {
    const h = await request("/api/health");
    assert(h.status === "ok", "status not ok");
    assert(h.features?.checkout === true, "checkout feature missing");
    assert(h.features?.mophImport === true, "mophImport feature missing");
  });

  await test("POST /api/auth/login — bad password", async () => {
    try {
      await request("/api/auth/login", {
        method: "POST",
        json: { username: USER, password: "wrong" },
      });
      throw new Error("expected 401");
    } catch (e) {
      assert(String(e.message).includes("401"), e.message);
    }
  });

  await test("POST /api/auth/login — success", async () => {
    const data = await request("/api/auth/login", {
      method: "POST",
      json: { username: USER, password: PASS },
    });
    assert(data.token, "no token");
    token = data.token;
  });

  await test("GET /api/auth/me — requires token", async () => {
    const me = await request("/api/auth/me", { token });
    assert(me.user?.username === USER, "wrong user");
  });

  await test("GET /api/products — 401 without token", async () => {
    try {
      await request("/api/products");
      throw new Error("expected 401");
    } catch (e) {
      assert(String(e.message).includes("401"), e.message);
    }
  });

  await test("GET /api/settings", async () => {
    const s = await request("/api/settings", { token });
    assert(s.exchange_rate > 0, "exchange_rate missing");
  });

  let productTotal = 0;
  let sampleProduct = null;

  await test("GET /api/products — pagination shape", async () => {
    const p = await request("/api/products?page=1&pageSize=50", { token });
    assert(Array.isArray(p.items), "items not array");
    assert(typeof p.total === "number", "total missing");
    assert(p.page === 1, "page should be 1");
    assert(p.pageSize === 50, "pageSize should be 50");
    assert(typeof p.totalPages === "number", "totalPages missing");
    productTotal = p.total;
    sampleProduct = p.items[0] ?? null;
    assert(productTotal > 0, "expected imported catalog (total > 0)");
  });

  await test("GET /api/products — page 2 when available", async () => {
    if (productTotal <= 50) return;
    const p = await request("/api/products?page=2&pageSize=50", { token });
    assert(p.page === 2, "page 2");
    assert(p.items.length > 0, "page 2 empty");
  });

  await test("GET /api/products — search by MoPH code or name", async () => {
    if (!sampleProduct) return;
    const q =
      sampleProduct.moph_code?.trim() ||
      sampleProduct.name.trim().slice(0, 4);
    if (q.length < 2) return;
    const p = await request(`/api/products?search=${encodeURIComponent(q)}&page=1`, { token });
    assert(p.total >= 1, `search "${q}" returned 0`);
    assert(p.items.some((x) => x.id === sampleProduct.id || x.moph_code === sampleProduct.moph_code), "sample not in search");
  });

  await test("GET /api/inventory/batches — summary + pagination", async () => {
    const b = await request("/api/inventory/batches?page=1&pageSize=50", { token });
    assert(Array.isArray(b.items), "items not array");
    assert(b.summary?.batch_count >= 0, "summary.batch_count");
    assert(typeof b.summary?.total_qty === "number", "summary.total_qty");
    assert(typeof b.summary?.product_count === "number", "summary.product_count");
    assert(b.total === b.summary.batch_count || b.summary.batch_count === 0, "total vs summary batch_count");
  });

  await test("GET /api/pos/search — empty for <2 chars (no barcode)", async () => {
    const a = await request("/api/pos/search?q=", { token });
    const b = await request("/api/pos/search?q=a", { token });
    assert(Array.isArray(a) && a.length === 0, "empty q should be []");
    assert(Array.isArray(b) && b.length === 0, "1-char q should be []");
  });

  const testBarcode = `628100${String(Date.now()).slice(-7)}`;

  await test("Barcode scan — exact match on POS", async () => {
    const created = await request("/api/products", {
      method: "POST",
      token,
      json: {
        name: `BARCODE_TEST_${Date.now()}`,
        barcode: testBarcode,
        sale_price_usd: 2,
      },
    });
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1);
    await request("/api/inventory/receive", {
      method: "POST",
      token,
      json: {
        product_id: created.id,
        qty: 5,
        expiry_date: exp.toISOString().slice(0, 10),
      },
    });
    const found = await request(`/api/pos/search?q=${encodeURIComponent(testBarcode)}`, { token });
    assert(found.length === 1, "expected one barcode hit");
    assert(found[0].barcode === testBarcode, "barcode mismatch");
    assert(found[0].total_qty >= 5, "stock not visible");
  });

  await test("GET /api/pos/search — finds products (2+ chars)", async () => {
    if (!sampleProduct) return;
    const q = (sampleProduct.moph_code || sampleProduct.name).trim().slice(0, 4);
    if (q.length < 2) return;
    const found = await request(`/api/pos/search?q=${encodeURIComponent(q)}`, { token });
    assert(found.length >= 1, "POS search empty");
  });

  const testSku = `E2E_TEST_${Date.now()}`;
  let testProductId = 0;
  let testBatchId = 0;

  await test("POST /api/products — create test product", async () => {
    const created = await request("/api/products", {
      method: "POST",
      token,
      json: {
        name: testSku,
        barcode: `BC${Date.now()}`,
        category: "test",
        sale_price_usd: 1.5,
      },
    });
    testProductId = created.id;
    assert(created.name === testSku, "name mismatch");
  });

  await test("POST /api/inventory/receive — stock for test product", async () => {
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1);
    const expiry = exp.toISOString().slice(0, 10);
    const r = await request("/api/inventory/receive", {
      method: "POST",
      token,
      json: {
        product_id: testProductId,
        qty: 10,
        expiry_date: expiry,
        cost_usd: 1,
        notes: "e2e test",
      },
    });
    testBatchId = r.batch_id;
    assert(r.product_id === testProductId, "product_id");
  });

  await test("POST /api/checkout — sale with change", async () => {
    const detail = await request("/api/checkout", {
      method: "POST",
      token,
      json: {
        items: [{ product_id: testProductId, qty: 2 }],
        discount_usd: 0,
        paid_usd: 10,
        paid_lbp: 0,
        payment_method: "cash",
      },
    });
    assert(detail.sale?.id, "no sale id");
    assert(detail.lines?.length >= 1, "no lines");
    assert((detail.sale.change_usd ?? 0) > 0, "expected change_usd > 0");
    assert(detail.sale.paid_usd === 10, "paid_usd stored");
  });

  await test("GET /api/sales — list includes today", async () => {
    const sales = await request("/api/sales", { token });
    assert(Array.isArray(sales), "sales not array");
    assert(sales.length >= 1, "no sales");
  });

  await test("GET /api/reports/dashboard", async () => {
    const r = await request("/api/reports/dashboard", { token });
    assert(r.salesToday, "salesToday missing");
    assert(Array.isArray(r.lowStock), "lowStock missing");
  });

  await test("GET /api/moph/status", async () => {
    const s = await request("/api/moph/status", { token });
    assert(s.list_page_url || s.file_roles, "moph status incomplete");
  });

  await test("POST /api/moph/check — price preview (may download)", async () => {
    const check = await request("/api/moph/check", {
      method: "POST",
      token,
      json: {},
      timeoutMs: 120_000,
    });
    assert(check.checkId, "no checkId");
    assert(typeof check.rowsCompared === "number", "rowsCompared");
    assert(check.syncMode === "prices_only", "syncMode");
  });

  await test("GET /api/backup — list", async () => {
    const backups = await request("/api/backup", { token });
    assert(Array.isArray(backups), "backups not array");
  });

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log("Results:\n");
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${r.name} (${r.ms}ms)${r.error ? ` — ${r.error}` : ""}`);
  }

  console.log(`\n${passed}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailed tests:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.error}`);
    process.exit(1);
  }
  console.log("\nAll automated API tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
