import fs from "fs";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";

// Must run before any server module is loaded: import this file first in every test file.
process.env.NODE_ENV = "test";
process.env.PHARMACORE_DB_PATH = ":memory:";
process.env.PHARMACORE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pharmacore-test-"));
process.env.INITIAL_ADMIN_PASSWORD = "admin123";
process.env.AI_MODEL = "";
process.env.AI_API_KEY = "";

export type ApiResponse<T = any> = { status: number; body: T };

export type TestServer = {
  base: string;
  close: () => Promise<void>;
  call: <T = any>(method: string, url: string, options?: { token?: string; body?: unknown }) => Promise<ApiResponse<T>>;
  login: (username: string, password: string) => Promise<string>;
  ownerToken: string;
  createUser: (role: "owner" | "pharmacist" | "cashier", password?: string) => Promise<{ id: number; username: string; token: string }>;
  receiveProduct: (options: {
    name?: string;
    price: number;
    qty: number;
    expiry: string;
    cost?: number | null;
    token?: string;
  }) => Promise<{ product_id: number; batch_id: number }>;
  receiveBatch: (productId: number, qty: number, expiry: string, cost?: number | null) => Promise<number>;
};

let counter = 0;
export const uniqueName = (prefix: string) => `${prefix}_${process.pid}_${++counter}`;

export function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function startServer(): Promise<TestServer> {
  const { createApp } = await import("../src/app.js");
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call: TestServer["call"] = async (method, url, options = {}) => {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${url}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  const login = async (username: string, password: string) => {
    const res = await call("POST", "/api/auth/login", { body: { username, password } });
    if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.token as string;
  };

  const ownerToken = await login("admin", "admin123");

  const createUser: TestServer["createUser"] = async (role, password = "secret123") => {
    const username = uniqueName(role);
    const res = await call("POST", "/api/users", { token: ownerToken, body: { username, role, password, full_name: role } });
    if (res.status !== 201) throw new Error(`create user failed: ${JSON.stringify(res.body)}`);
    return { id: res.body.id, username, token: await login(username, password) };
  };

  const receiveProduct: TestServer["receiveProduct"] = async ({ name, price, qty, expiry, cost = null, token }) => {
    const res = await call("POST", "/api/inventory/receive", {
      token: token ?? ownerToken,
      body: { product: { name: name ?? uniqueName("Product"), sale_price_usd: price }, qty, expiry_date: expiry, cost_usd: cost },
    });
    if (res.status !== 201) throw new Error(`receive failed: ${JSON.stringify(res.body)}`);
    return res.body;
  };

  const receiveBatch: TestServer["receiveBatch"] = async (productId, qty, expiry, cost = null) => {
    const res = await call("POST", "/api/inventory/receive", {
      token: ownerToken,
      body: { product_id: productId, qty, expiry_date: expiry, cost_usd: cost },
    });
    if (res.status !== 201) throw new Error(`receive batch failed: ${JSON.stringify(res.body)}`);
    return res.body.batch_id as number;
  };

  return {
    base,
    call,
    login,
    ownerToken,
    createUser,
    receiveProduct,
    receiveBatch,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function stockOf(server: TestServer, productId: number): Promise<number> {
  const res = await server.call("GET", `/api/products/${productId}`, { token: server.ownerToken });
  return res.body.total_qty;
}
