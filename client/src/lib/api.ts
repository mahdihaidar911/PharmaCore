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

export type User = {
  id: number;
  username: string;
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

export type DashboardReport = {
  date: string;
  salesToday: {
    sale_count: number;
    total_usd: number;
    total_lbp: number;
    paid_usd: number;
    paid_lbp: number;
  };
  salesByCashier: { username: string | null; sale_count: number; total_usd: number }[];
  lowStock: { id: number; name: string; barcode: string | null; min_stock: number; total_qty: number }[];
  nearExpiry: { id: number; qty: number; expiry_date: string; product_name: string; barcode: string | null }[];
  expired: { id: number; qty: number; expiry_date: string; product_name: string; barcode: string | null }[];
  topProducts: { name: string; qty_sold: number; revenue_usd: number }[];
};

export type BackupFile = {
  filename: string;
  size_bytes: number;
  created_at: string;
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
    throw new Error(message);
  }

  return data as T;
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
  getProducts(options?: { search?: string; page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (options?.search?.trim()) params.set("search", options.search.trim());
    if (options?.page) params.set("page", String(options.page));
    if (options?.pageSize) params.set("pageSize", String(options.pageSize));
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
    return request<{ filename: string }>("/api/backup/create", { method: "POST" });
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
};

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatLbp(amount: number) {
  return new Intl.NumberFormat("en-LB", { style: "currency", currency: "LBP", maximumFractionDigits: 0 }).format(amount);
}

export function usdToLbp(usd: number, rate: number) {
  return Math.round(usd * rate);
}
