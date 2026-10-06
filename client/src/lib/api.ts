export type PharmacyProfile = {
  name: string;
  name_ar: string;
  pharmacist_name: string;
  license_no: string;
  order_reg_no: string;
  cnss_no: string;
  location: string;
  phone: string;
  vat_no: string;
};

export type PharmacySettings = {
  id: number;
  name: string;
  name_ar?: string;
  address: string;
  phone: string;
  receipt_footer: string;
  exchange_rate: number;
  pharmacist_name?: string;
  license_no?: string;
  order_reg_no?: string;
  cnss_no?: string;
  location?: string;
  vat_no?: string;
  updated_at: string;
};

export type Product = {
  id: number;
  barcode: string | null;
  moph_code: string | null;
  brand_name: string | null;
  name: string;
  category: string | null;
  sale_price_usd: number;
  is_active: boolean;
  total_qty: number;
  created_at: string;
  updated_at: string;
};

export type PosProduct = {
  id: number;
  barcode: string | null;
  name: string;
  category: string | null;
  sale_price_usd: number;
  total_qty: number;
};

export type StockBatch = {
  id: number;
  product_id: number;
  qty: number;
  expiry_date: string;
  cost_usd: number | null;
  received_at: string;
  notes: string | null;
  product_name: string;
  barcode: string | null;
  moph_code?: string | null;
  sale_price_usd: number;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type BatchListResult = Paginated<StockBatch> & {
  summary: {
    batch_count: number;
    total_qty: number;
    product_count: number;
  };
};

export type Role = "owner" | "pharmacist" | "cashier";

export type Permission =
  | "pos.sell"
  | "pos.discount"
  | "pos.price_override"
  | "sales.view"
  | "returns.create"
  | "cash.drawer"
  | "cash.reconcile"
  | "products.view"
  | "products.manage"
  | "products.link_barcode"
  | "inventory.view"
  | "inventory.receive"
  | "inventory.adjust"
  | "reports.inventory"
  | "reports.sales"
  | "reports.profit"
  | "settings.exchange_rate"
  | "settings.manage"
  | "users.manage"
  | "backup.create"
  | "backup.restore"
  | "catalog.import"
  | "ai.use"
  | "ai.logs";

export type User = {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  permissions: Permission[];
};

export type ManagedUser = {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type AdjustmentReason = "expired" | "damaged" | "lost" | "count_correction" | "other";

export type StockMovement = {
  id: number;
  created_at: string;
  movement_type: "receive" | "sale" | "return" | "adjustment";
  qty_change: number;
  reason: string | null;
  notes: string | null;
  reference_id: number | null;
  batch_id: number | null;
  product_id: number;
  product_name: string;
  username: string | null;
};

export type MovementsReport = {
  period: { from: string; to: string };
  totals_by_type: { movement_type: string; movement_count: number; net_units: number }[];
  movements: StockMovement[];
};

export type SalesSummary = {
  period: { from: string; to: string; days: number };
  sale_count: number;
  net_revenue_usd: number;
  net_revenue_lbp: number;
  discounts_usd: number;
  average_sale_usd: number;
  units_sold: number;
  distinct_products_sold: number;
  return_count: number;
  refunds_usd: number;
  revenue_after_refunds_usd: number;
  by_payment_method: { payment_method: string; sale_count: number; net_revenue_usd: number }[];
  by_cashier: { cashier: string; sale_count: number; net_revenue_usd: number }[];
};

export type TopProductsReport = {
  products: {
    product_id: number;
    name: string;
    units_sold: number;
    units_returned: number;
    net_revenue_usd: number;
    current_stock: number;
  }[];
};

export type DailyRevenueReport = { days: { date: string; sale_count: number; net_revenue_usd: number }[] };

export type ProfitReport = {
  net_revenue_usd: number;
  cost_of_goods_usd: number;
  gross_profit_usd: number;
  gross_margin_percent: number | null;
  cost_coverage_percent: number | null;
  note: string;
};

export type QueryColumn = { key: string; label: string; type: "text" | "number" | "usd" | "date" | "datetime" };

export type StructuredQueryResult = {
  entity: "batches" | "products" | "sales";
  applied_filters: string[];
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  total: number;
  truncated: boolean;
};

export type AiToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  status: "ok" | "invalid_arguments" | "permission_denied" | "unknown_tool" | "error";
  error?: string;
  duration_ms: number;
};

export type AiChatReply = {
  answer: string;
  tool_calls: AiToolCall[];
  grounded: boolean;
  permission_denied: boolean;
  model: string;
};

export type AiStatus = {
  configured: boolean;
  model: string | null;
  host: string | null;
  tools: { name: string; description: string; allowed: boolean }[];
};

export type BusinessHighlight = {
  severity: "critical" | "warning" | "info" | "positive";
  title: string;
  detail: string;
};

export type BusinessAnalysis = {
  period: { from: string; to: string };
  highlights: BusinessHighlight[];
  narrative: string | null;
  ai_used: boolean;
  ai_configured: boolean;
  ai_error: string | null;
  model: string | null;
  snapshot: Record<string, unknown>;
};

export type AiSearchResult = StructuredQueryResult & { interpretation: string; model: string };

export type AiLogEntry = {
  id: number;
  kind: "chat" | "analyze" | "search";
  prompt: string;
  response: string | null;
  tool_calls: AiToolCall[];
  model: string | null;
  status: string;
  error: string | null;
  latency_ms: number | null;
  created_at: string;
  username: string | null;
};

export type SaleSummary = {
  id: number;
  total_usd: number;
  total_lbp: number;
  payment_method: string;
  created_at: string;
  cashier_name: string | null;
};

export type SaleLine = {
  id: number;
  sale_id: number;
  product_id: number;
  batch_id: number;
  qty: number;
  qty_returned: number;
  unit_price_usd: number;
  line_total_usd: number;
  product_name: string;
  barcode: string | null;
  moph_code?: string | null;
  expiry_date: string;
};

export type SaleDetail = {
  sale: {
    id: number;
    total_usd: number;
    total_lbp: number;
    exchange_rate_used: number;
    paid_usd: number;
    paid_lbp: number;
    change_usd?: number;
    change_lbp?: number;
    discount_usd: number;
    payment_method: string;
    created_at: string;
    cashier_name: string | null;
    notes: string | null;
  };
  lines: SaleLine[];
  settings: PharmacySettings;
};

export type CartItem = {
  product_id: number;
  name: string;
  barcode: string | null;
  qty: number;
  unit_price_usd: number;
  sale_price_usd: number;
};

/** Sales fields are null when the user's role cannot see revenue. */
export type DashboardReport = {
  date: string;
  salesToday: {
    sale_count: number;
    total_usd: number;
    total_lbp: number;
    paid_usd: number;
    paid_lbp: number;
  } | null;
  salesByCashier: { username: string | null; sale_count: number; total_usd: number }[] | null;
  topProducts: { name: string; qty_sold: number; revenue_usd: number }[] | null;
  lowStock: { id: number; name: string; barcode: string | null; min_stock: number; total_qty: number }[];
  lowStockTotal: number;
  outOfStockTotal: number;
  nearExpiry: { id: number; qty: number; expiry_date: string; product_name: string; barcode: string | null }[];
  nearExpiryTotal: number;
  expired: { id: number; qty: number; expiry_date: string; product_name: string; barcode: string | null }[];
  expiredTotal: number;
};

export type BackupFile = {
  filename: string;
  kind: "manual" | "auto" | "pre-restore";
  size_bytes: number;
  created_at: string;
};

export type BackupSettings = { auto_enabled: boolean; keep_auto: number; copy_dir: string };

export type BackupStatus = {
  last_backup_at: string | null;
  age_hours: number | null;
  stale: boolean;
  last_run: {
    kind: string;
    status: "ok" | "failed";
    error: string | null;
    copy_status: "copied" | "failed" | "skipped" | null;
    copy_error: string | null;
    created_at: string;
  } | null;
  settings: BackupSettings;
  interval_hours: number;
  warnings: string[];
};

export type CashShift = {
  id: number;
  status: "open" | "closed";
  opened_by_name: string | null;
  opened_at: string;
  opening_usd: number;
  opening_lbp: number;
  closed_by_name: string | null;
  closed_at: string | null;
  expected_usd?: number | null;
  expected_lbp?: number | null;
  counted_usd: number | null;
  counted_lbp: number | null;
  notes: string | null;
};

export type ShiftTotals = {
  sale_count: number;
  card_sale_count: number;
  net_sales_usd: number;
  cash_sales_usd: number;
  cash_sales_lbp: number;
  refunds_usd: number;
  refunds_lbp: number;
  pay_in_usd: number;
  pay_in_lbp: number;
  pay_out_usd: number;
  pay_out_lbp: number;
  expected_usd: number;
  expected_lbp: number;
};

export type CashMovement = {
  id: number;
  username: string | null;
  type: "pay_in" | "pay_out";
  amount_usd: number;
  amount_lbp: number;
  reason: string;
  created_at: string;
};

/** `totals` is null for roles that count blind (no cash.reconcile). */
export type CurrentShift =
  | { shift: null }
  | { shift: CashShift; movements: CashMovement[]; totals: ShiftTotals | null };

export type ShiftCloseResult = {
  shift: CashShift;
  totals: ShiftTotals | null;
  variance: { usd: number; lbp: number } | null;
};

export type ShiftHistoryItem = CashShift & {
  totals: ShiftTotals;
  variance_usd: number | null;
  variance_lbp: number | null;
};

export type HeldCart = {
  id: number;
  label: string | null;
  held_by: string | null;
  discount_usd: number;
  created_at: string;
  subtotal_usd: number;
  items: {
    product_id: number;
    qty: number;
    name: string;
    barcode: string | null;
    sale_price_usd: number;
    total_qty: number;
    available: boolean;
  }[];
};

export type MophStatus = {
  moph_price_list_url: string | null;
  moph_last_import_at: string | null;
  moph_last_import_source: string | null;
  default_url: string;
  list_page_url?: string;
};

export type MophChangeSample = {
  type: "new" | "price_change";
  moph_code: string;
  name: string;
  official_price_lbp: number | null;
  new_sale_price_usd: number;
  previous_official_price_lbp: number | null;
  previous_sale_price_usd: number | null;
};

export type MophCheckResult = {
  checkId: string;
  sourceUrl: string;
  listPageUrl: string;
  priceRowCount?: number;
  catalogRowCount?: number;
  marketedCount?: number;
  nonMarketedCount?: number;
  primaryCount?: number;
  totalInFile: number;
  rowsCompared: number;
  skippedUnmapped: number;
  newProducts: number;
  priceChanges: number;
  unchanged: number;
  notInCatalog?: number;
  syncMode?: "catalog" | "prices_only";
  sampleChanges: MophChangeSample[];
};

export type MophApplyResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  priceUpdates: number;
  notInCatalog?: number;
  source: string;
  applyRetailPrices: boolean;
  syncMode?: "catalog" | "prices_only";
};

const TOKEN_KEY = "pharmacore_token";
export const SESSION_EXPIRED_EVENT = "pharmacore:session-expired";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error(
      "Cannot reach the API on port 4000. Open a terminal in the PharmaCore folder and run: npm run dev",
    );
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && token && !path.startsWith("/api/auth/login")) {
    clearToken();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  if (!response.ok) {
    let message = "Request failed";
    if (typeof data.error === "string") {
      message = data.error;
    } else if (data.error && typeof data.error === "object" && "formErrors" in data.error) {
      message = "Invalid request. Check all fields.";
    } else if (response.status >= 500) {
      message =
        "API server is not running or crashed. Close all terminals, then run: npm run dev";
    }
    if (response.status === 404 && path.includes("/moph")) {
      message =
        "MoPH API not found — the server is outdated. Close all terminals, run npm run dev from PharmaCore, then refresh.";
    }
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

function withQuery(path: string, params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { method: "POST", headers, body: formData });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let message = typeof data.error === "string" ? data.error : "Request failed";
    if (response.status === 404 && path.includes("/moph")) {
      message =
        "MoPH API not found — the server is outdated. Close all terminals, run npm run dev from PharmaCore, then refresh.";
    }
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  login(username: string, password: string) {
    return request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  getSettings() {
    return request<PharmacySettings>("/api/settings");
  },
  updateSettings(payload: Pick<PharmacySettings, "address" | "receipt_footer" | "exchange_rate">) {
    return request<PharmacySettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  getProfile() {
    return request<PharmacyProfile>("/api/profile");
  },
  updateProfile(payload: PharmacyProfile) {
    return request<PharmacyProfile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  getProducts(options?: { search?: string; page?: number; pageSize?: number; includeInactive?: boolean }) {
    const params = new URLSearchParams();
    if (options?.search?.trim()) params.set("search", options.search.trim());
    if (options?.page) params.set("page", String(options.page));
    if (options?.pageSize) params.set("pageSize", String(options.pageSize));
    if (options?.includeInactive) params.set("active", "false");
    const query = params.toString();
    return request<Paginated<Product>>(`/api/products${query ? `?${query}` : ""}`);
  },
  createProduct(payload: {
    barcode?: string | null;
    name: string;
    category?: string | null;
    sale_price_usd: number;
  }) {
    return request<Product>("/api/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateProduct(
    id: number,
    payload: {
      barcode?: string | null;
      name: string;
      category?: string | null;
      sale_price_usd: number;
      is_active?: boolean;
    },
  ) {
    return request<Product>(`/api/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  linkProductBarcode(id: number, barcode: string) {
    return request<Product>(`/api/products/${id}/barcode`, {
      method: "PATCH",
      body: JSON.stringify({ barcode }),
    });
  },
  receiveStock(payload: {
    product_id?: number;
    product?: {
      barcode?: string | null;
      name: string;
      category?: string | null;
      sale_price_usd: number;
    };
    qty: number;
    expiry_date: string;
    cost_usd?: number | null;
    notes?: string | null;
  }) {
    return request<{ product_id: number; batch_id: number }>("/api/inventory/receive", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getBatches(options?: { search?: string; page?: number; pageSize?: number; product_id?: number }) {
    const params = new URLSearchParams();
    if (options?.search?.trim()) params.set("search", options.search.trim());
    if (options?.page) params.set("page", String(options.page));
    if (options?.pageSize) params.set("pageSize", String(options.pageSize));
    if (options?.product_id) params.set("product_id", String(options.product_id));
    const query = params.toString();
    return request<BatchListResult>(`/api/inventory/batches${query ? `?${query}` : ""}`);
  },
  searchPos(q: string) {
    const normalized = q.replace(/[\x00-\x1F\x7F]/g, "").trim();
    return request<PosProduct[]>(`/api/pos/search?q=${encodeURIComponent(normalized)}`);
  },
  getHealth() {
    return request<{
      status: string;
      version?: string;
      features?: { checkout?: boolean; mophImport?: boolean };
    }>("/api/health");
  },
  checkout(payload: {
    items: { product_id: number; qty: number; unit_price_usd?: number }[];
    discount_usd: number;
    paid_usd: number;
    paid_lbp: number;
    payment_method: "cash" | "card" | "mixed";
    notes?: string;
  }) {
    return request<SaleDetail>("/api/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getSales(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<SaleSummary[]>(`/api/sales${query}`);
  },
  getSale(id: number) {
    return request<SaleDetail>(`/api/sales/${id}`);
  },
  createReturn(payload: {
    sale_id: number;
    items: { sale_line_id: number; qty: number }[];
    refund_usd: number;
    refund_lbp: number;
    notes?: string;
  }) {
    return request<{ return_id: number; sale: SaleDetail }>("/api/returns", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getDashboardReport(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<DashboardReport>(`/api/reports/dashboard${query}`);
  },
  listBackups() {
    return request<BackupFile[]>("/api/backup");
  },
  createBackup() {
    return post<{ filename: string; copy_status: "copied" | "failed" | "skipped"; copy_error: string | null }>("/api/backup/create");
  },
  getBackupStatus() {
    return request<BackupStatus>("/api/backup/status");
  },
  updateBackupSettings(payload: BackupSettings) {
    return request<BackupSettings>("/api/backup/settings", { method: "PUT", body: JSON.stringify(payload) });
  },
  getCurrentShift() {
    return request<CurrentShift>("/api/shifts/current");
  },
  openShift(payload: { opening_usd: number; opening_lbp: number; notes?: string }) {
    return post<{ shift: CashShift }>("/api/shifts/open", payload);
  },
  addCashMovement(shiftId: number, payload: { type: "pay_in" | "pay_out"; amount_usd: number; amount_lbp: number; reason: string }) {
    return post<{ id: number }>(`/api/shifts/${shiftId}/movements`, payload);
  },
  closeShift(shiftId: number, payload: { counted_usd: number; counted_lbp: number; notes?: string }) {
    return post<ShiftCloseResult>(`/api/shifts/${shiftId}/close`, payload);
  },
  listShifts(limit = 30) {
    return request<{ shifts: ShiftHistoryItem[] }>(withQuery("/api/shifts", { limit }));
  },
  getShiftDetail(id: number) {
    return request<{ shift: CashShift; totals: ShiftTotals; movements: CashMovement[] }>(`/api/shifts/${id}`);
  },
  listHeldCarts() {
    return request<HeldCart[]>("/api/held-carts");
  },
  holdCart(payload: { label?: string; items: { product_id: number; qty: number }[]; discount_usd: number }) {
    return post<HeldCart>("/api/held-carts", payload);
  },
  resumeHeldCart(id: number) {
    return post<HeldCart>(`/api/held-carts/${id}/resume`);
  },
  discardHeldCart(id: number) {
    return request<void>(`/api/held-carts/${id}`, { method: "DELETE" });
  },
  restoreBackup(filename: string) {
    return request<{ message: string; restarted_required: boolean }>("/api/backup/restore", {
      method: "POST",
      body: JSON.stringify({ filename }),
    });
  },
  getMophStatus() {
    return request<MophStatus>("/api/moph/status");
  },
  checkMophPrices(options?: { useBundled?: boolean; maxRows?: number }) {
    return request<MophCheckResult>("/api/moph/check", {
      method: "POST",
      body: JSON.stringify({
        useBundled: options?.useBundled === true,
        maxRows: options?.maxRows,
      }),
    });
  },
  checkMophUpload(file: File) {
    const formData = new FormData();
    formData.set("file", file);
    return uploadRequest<MophCheckResult>("/api/moph/check-upload", formData);
  },
  applyMophCheck(checkId: string, applyRetailPrices = true) {
    return request<MophApplyResult>("/api/moph/apply", {
      method: "POST",
      body: JSON.stringify({ checkId, applyRetailPrices }),
    });
  },
  checkMophCatalog(options?: { maxRows?: number }) {
    return request<MophCheckResult>("/api/moph/catalog/check", {
      method: "POST",
      body: JSON.stringify({ maxRows: options?.maxRows }),
    });
  },
  checkMophCatalogUpload(files: {
    marketed?: File | null;
    nonMarketed?: File | null;
    primaryRegistered?: File | null;
  }) {
    const formData = new FormData();
    if (files.marketed) formData.set("marketed", files.marketed);
    if (files.nonMarketed) formData.set("nonMarketed", files.nonMarketed);
    if (files.primaryRegistered) formData.set("primaryRegistered", files.primaryRegistered);
    return uploadRequest<MophCheckResult>("/api/moph/catalog/check", formData);
  },
  applyMophCatalog(checkId: string, applyRetailPrices = true) {
    return request<MophApplyResult>("/api/moph/catalog/apply", {
      method: "POST",
      body: JSON.stringify({ checkId, applyRetailPrices }),
    });
  },

  changePassword(current_password: string, new_password: string) {
    return post<{ ok: true }>("/api/auth/change-password", { current_password, new_password });
  },
  listUsers() {
    return request<ManagedUser[]>("/api/users");
  },
  createUser(payload: { username: string; full_name: string; role: Role; password: string }) {
    return post<ManagedUser>("/api/users", payload);
  },
  updateUser(id: number, payload: Partial<Pick<ManagedUser, "full_name" | "role" | "is_active">>) {
    return request<ManagedUser>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  resetUserPassword(id: number, password: string) {
    return post<{ ok: true }>(`/api/users/${id}/reset-password`, { password });
  },

  adjustStock(payload: { batch_id: number; qty_change: number; reason: AdjustmentReason; notes?: string | null }) {
    return post<{ batch_id: number; qty: number }>("/api/inventory/adjust", payload);
  },
  getMovements(params: { from?: string; to?: string; type?: string; product_id?: number; limit?: number }) {
    return request<MovementsReport>(withQuery("/api/reports/movements", params));
  },
  getSalesSummary(from: string, to: string) {
    return request<SalesSummary>(withQuery("/api/reports/sales-summary", { from, to }));
  },
  getTopProducts(from: string, to: string, sort: "units" | "revenue" = "units", limit = 15) {
    return request<TopProductsReport>(withQuery("/api/reports/top-products", { from, to, sort, limit }));
  },
  getDailyRevenue(from: string, to: string) {
    return request<DailyRevenueReport>(withQuery("/api/reports/daily-revenue", { from, to }));
  },
  getProfit(from: string, to: string) {
    return request<ProfitReport>(withQuery("/api/reports/profit", { from, to }));
  },

  aiStatus() {
    return request<AiStatus>("/api/ai/status");
  },
  aiChat(messages: { role: "user" | "assistant"; content: string }[]) {
    return post<AiChatReply>("/api/ai/chat", { messages });
  },
  aiAnalyze(from?: string, to?: string) {
    return post<BusinessAnalysis>("/api/ai/analyze", { from, to });
  },
  aiSearch(query: string) {
    return post<AiSearchResult>("/api/ai/search", { query });
  },
  aiLogs(limit = 50) {
    return request<AiLogEntry[]>(`/api/ai/logs?limit=${limit}`);
  },
};

/** Today's date on this computer (not UTC), as YYYY-MM-DD. */
export function localToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** SQLite stores UTC timestamps without a zone marker; parse them as UTC for local display. */
export function parseServerDate(value: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
}

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatLbp(amount: number) {
  return new Intl.NumberFormat("en-LB", { style: "currency", currency: "LBP", maximumFractionDigits: 0 }).format(amount);
}

export function usdToLbp(usd: number, rate: number) {
  return Math.round(usd * rate);
}
