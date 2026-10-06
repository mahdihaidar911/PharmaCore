import type Database from "better-sqlite3";

function columnExists(database: Database.Database, table: string, column: string): boolean {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((col) => col.name === column);
}

function addColumn(database: Database.Database, table: string, ddl: string) {
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

export function runMigrations(database: Database.Database) {
  if (!columnExists(database, "users", "role")) {
    addColumn(database, "users", "role TEXT NOT NULL DEFAULT 'owner'");
  }

  if (!columnExists(database, "users", "full_name")) {
    addColumn(database, "users", "full_name TEXT");
  }
  if (!columnExists(database, "users", "is_active")) {
    addColumn(database, "users", "is_active INTEGER NOT NULL DEFAULT 1");
  }
  if (!columnExists(database, "users", "last_login_at")) {
    addColumn(database, "users", "last_login_at TEXT");
  }

  if (!columnExists(database, "products", "min_stock")) {
    addColumn(database, "products", "min_stock INTEGER NOT NULL DEFAULT 5");
  }
  if (!columnExists(database, "products", "moph_code")) {
    addColumn(database, "products", "moph_code TEXT");
  }
  if (!columnExists(database, "products", "official_price_lbp")) {
    addColumn(database, "products", "official_price_lbp REAL");
  }
  if (!columnExists(database, "products", "last_price_update_date")) {
    addColumn(database, "products", "last_price_update_date TEXT");
  }
  if (!columnExists(database, "products", "generic_name")) {
    addColumn(database, "products", "generic_name TEXT");
  }
  if (!columnExists(database, "products", "strength")) {
    addColumn(database, "products", "strength TEXT");
  }
  if (!columnExists(database, "products", "dosage_form")) {
    addColumn(database, "products", "dosage_form TEXT");
  }
  if (!columnExists(database, "products", "manufacturer")) {
    addColumn(database, "products", "manufacturer TEXT");
  }
  if (!columnExists(database, "products", "agent")) {
    addColumn(database, "products", "agent TEXT");
  }
  if (!columnExists(database, "products", "atc_code")) {
    addColumn(database, "products", "atc_code TEXT");
  }
  if (!columnExists(database, "products", "moph_registration")) {
    addColumn(database, "products", "moph_registration TEXT");
  }
  if (!columnExists(database, "products", "country_of_origin")) {
    addColumn(database, "products", "country_of_origin TEXT");
  }
  if (!columnExists(database, "products", "subsidy_percent")) {
    addColumn(database, "products", "subsidy_percent REAL");
  }
  if (!columnExists(database, "products", "brand_name")) {
    addColumn(database, "products", "brand_name TEXT");
  }
  if (!columnExists(database, "products", "presentation")) {
    addColumn(database, "products", "presentation TEXT");
  }
  if (!columnExists(database, "products", "pharmacist_margin")) {
    addColumn(database, "products", "pharmacist_margin REAL");
  }
  if (!columnExists(database, "products", "stratum")) {
    addColumn(database, "products", "stratum TEXT");
  }
  if (!columnExists(database, "pharmacy_settings", "moph_catalog_list_url")) {
    addColumn(database, "pharmacy_settings", "moph_catalog_list_url TEXT");
  }

  if (!columnExists(database, "pharmacy_settings", "moph_price_list_url")) {
    addColumn(database, "pharmacy_settings", "moph_price_list_url TEXT");
  }
  if (!columnExists(database, "pharmacy_settings", "moph_last_import_at")) {
    addColumn(database, "pharmacy_settings", "moph_last_import_at TEXT");
  }
  if (!columnExists(database, "pharmacy_settings", "moph_last_import_source")) {
    addColumn(database, "pharmacy_settings", "moph_last_import_source TEXT");
  }
  if (!columnExists(database, "pharmacy_settings", "pharmacist_name")) {
    addColumn(database, "pharmacy_settings", "pharmacist_name TEXT NOT NULL DEFAULT ''");
  }
  if (!columnExists(database, "pharmacy_settings", "license_no")) {
    addColumn(database, "pharmacy_settings", "license_no TEXT NOT NULL DEFAULT ''");
  }
  if (!columnExists(database, "pharmacy_settings", "order_reg_no")) {
    addColumn(database, "pharmacy_settings", "order_reg_no TEXT NOT NULL DEFAULT ''");
  }
  if (!columnExists(database, "pharmacy_settings", "cnss_no")) {
    addColumn(database, "pharmacy_settings", "cnss_no TEXT NOT NULL DEFAULT ''");
  }
  if (!columnExists(database, "pharmacy_settings", "location")) {
    addColumn(database, "pharmacy_settings", "location TEXT NOT NULL DEFAULT ''");
    database.exec(
      `UPDATE pharmacy_settings SET location = address WHERE id = 1 AND (location IS NULL OR location = '')`,
    );
  }
  if (!columnExists(database, "pharmacy_settings", "vat_no")) {
    addColumn(database, "pharmacy_settings", "vat_no TEXT NOT NULL DEFAULT ''");
  }
  if (!columnExists(database, "pharmacy_settings", "name_ar")) {
    addColumn(database, "pharmacy_settings", "name_ar TEXT NOT NULL DEFAULT ''");
  }

  try {
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_moph_code
      ON products(moph_code)
      WHERE moph_code IS NOT NULL AND moph_code != '';
    `);
  } catch (error) {
    console.warn(
      "MoPH code unique index skipped (duplicate moph_code values in DB):",
      error instanceof Error ? error.message : error,
    );
  }

  if (!columnExists(database, "sales", "user_id")) {
    addColumn(database, "sales", "user_id INTEGER REFERENCES users(id)");
  }
  if (!columnExists(database, "sales", "discount_usd")) {
    addColumn(database, "sales", "discount_usd REAL NOT NULL DEFAULT 0");
  }
  if (!columnExists(database, "sales", "payment_method")) {
    addColumn(database, "sales", "payment_method TEXT NOT NULL DEFAULT 'cash'");
  }
  if (!columnExists(database, "sales", "include_in_reports")) {
    addColumn(database, "sales", "include_in_reports INTEGER NOT NULL DEFAULT 1");
  }
  if (!columnExists(database, "sales", "notes")) {
    addColumn(database, "sales", "notes TEXT");
  }
  if (!columnExists(database, "sales", "change_usd")) {
    addColumn(database, "sales", "change_usd REAL NOT NULL DEFAULT 0");
  }
  if (!columnExists(database, "sales", "change_lbp")) {
    addColumn(database, "sales", "change_lbp REAL NOT NULL DEFAULT 0");
  }

  if (!columnExists(database, "sale_lines", "discount_usd")) {
    addColumn(database, "sale_lines", "discount_usd REAL NOT NULL DEFAULT 0");
  }
  if (!columnExists(database, "sale_lines", "qty_returned")) {
    addColumn(database, "sale_lines", "qty_returned INTEGER NOT NULL DEFAULT 0");
  }

  if (!columnExists(database, "stock_movements", "user_id")) {
    addColumn(database, "stock_movements", "user_id INTEGER REFERENCES users(id)");
  }
  if (!columnExists(database, "stock_movements", "reason")) {
    addColumn(database, "stock_movements", "reason TEXT");
  }

  if (!columnExists(database, "pharmacy_settings", "backup_auto_enabled")) {
    addColumn(database, "pharmacy_settings", "backup_auto_enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!columnExists(database, "pharmacy_settings", "backup_keep_auto")) {
    addColumn(database, "pharmacy_settings", "backup_keep_auto INTEGER NOT NULL DEFAULT 14");
  }
  if (!columnExists(database, "pharmacy_settings", "backup_copy_dir")) {
    addColumn(database, "pharmacy_settings", "backup_copy_dir TEXT NOT NULL DEFAULT ''");
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS cash_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      opened_by INTEGER NOT NULL REFERENCES users(id),
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      opening_usd REAL NOT NULL DEFAULT 0,
      opening_lbp REAL NOT NULL DEFAULT 0,
      closed_by INTEGER REFERENCES users(id),
      closed_at TEXT,
      expected_usd REAL,
      expected_lbp REAL,
      counted_usd REAL,
      counted_lbp REAL,
      notes TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_shifts_one_open ON cash_shifts(status) WHERE status = 'open';

    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES cash_shifts(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK (type IN ('pay_in', 'pay_out')),
      amount_usd REAL NOT NULL DEFAULT 0,
      amount_lbp REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id);

    CREATE TABLE IF NOT EXISTS held_carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      label TEXT,
      items TEXT NOT NULL,
      discount_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backup_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      filename TEXT,
      status TEXT NOT NULL,
      error TEXT,
      copy_status TEXT,
      copy_error TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_backup_runs_created ON backup_runs(created_at);
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      user_id INTEGER REFERENCES users(id),
      refund_usd REAL NOT NULL DEFAULT 0,
      refund_lbp REAL NOT NULL DEFAULT 0,
      exchange_rate_used REAL NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES returns(id),
      sale_line_id INTEGER NOT NULL REFERENCES sale_lines(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      batch_id INTEGER NOT NULL REFERENCES stock_batches(id),
      qty INTEGER NOT NULL CHECK (qty > 0),
      unit_price_usd REAL NOT NULL,
      line_refund_usd REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      kind TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT,
      tool_calls TEXT,
      model TEXT,
      status TEXT NOT NULL,
      error TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ai_logs_created ON ai_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_sale_lines_product ON sale_lines(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON sale_lines(sale_id);
    CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);

  if (!columnExists(database, "sales", "shift_id")) {
    addColumn(database, "sales", "shift_id INTEGER REFERENCES cash_shifts(id)");
  }
  if (!columnExists(database, "returns", "shift_id")) {
    addColumn(database, "returns", "shift_id INTEGER REFERENCES cash_shifts(id)");
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
    CREATE INDEX IF NOT EXISTS idx_returns_shift ON returns(shift_id);
  `);
}
