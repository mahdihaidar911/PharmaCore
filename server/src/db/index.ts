import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { runMigrations } from "./migrate.js";

export const dbPath = config.dbPath;

if (dbPath !== ":memory:") {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pharmacy_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT 'PharmaCore Pharmacy',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      receipt_footer TEXT NOT NULL DEFAULT 'Thank you for your visit.',
      exchange_rate REAL NOT NULL DEFAULT 89500,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT,
      sale_price_usd REAL NOT NULL CHECK (sale_price_usd >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL CHECK (qty >= 0),
      expiry_date TEXT NOT NULL,
      cost_usd REAL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      batch_id INTEGER REFERENCES stock_batches(id),
      movement_type TEXT NOT NULL,
      qty_change INTEGER NOT NULL,
      reference_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_usd REAL NOT NULL,
      total_lbp REAL NOT NULL,
      exchange_rate_used REAL NOT NULL,
      paid_usd REAL NOT NULL DEFAULT 0,
      paid_lbp REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sale_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      batch_id INTEGER NOT NULL REFERENCES stock_batches(id),
      qty INTEGER NOT NULL CHECK (qty > 0),
      unit_price_usd REAL NOT NULL,
      line_total_usd REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_stock_batches_product ON stock_batches(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON stock_batches(expiry_date);
  `);

  runMigrations(db);

  const settings = db.prepare("SELECT id FROM pharmacy_settings WHERE id = 1").get();
  if (!settings) {
    db.prepare(`
      INSERT INTO pharmacy_settings (id, name, address, phone, receipt_footer, exchange_rate)
      VALUES (1, 'PharmaCore Pharmacy', '', '', 'Thank you for your visit.', 89500)
    `).run();
  }

  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    const passwordHash = bcrypt.hashSync(config.initialAdminPassword, 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, 'owner', 'Owner')
    `).run("admin", passwordHash);
  }
}

export type ProductRow = {
  id: number;
  barcode: string | null;
  name: string;
  category: string | null;
  sale_price_usd: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  full_name: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
};

export type SettingsRow = {
  id: number;
  name: string;
  name_ar: string;
  address: string;
  phone: string;
  receipt_footer: string;
  exchange_rate: number;
  pharmacist_name: string;
  license_no: string;
  order_reg_no: string;
  cnss_no: string;
  location: string;
  vat_no: string;
  backup_auto_enabled: number;
  backup_keep_auto: number;
  backup_copy_dir: string;
  updated_at: string;
};
