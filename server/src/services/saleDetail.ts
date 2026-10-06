import { db, type SettingsRow } from "../db/index.js";

export function getSaleDetail(saleId: number) {
  const sale = db
    .prepare(`
      SELECT s.*, u.username as cashier_name
      FROM sales s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `)
    .get(saleId);

  const lines = db
    .prepare(`
      SELECT sl.*, p.name as product_name, p.barcode, p.moph_code, sb.expiry_date
      FROM sale_lines sl
      JOIN products p ON p.id = sl.product_id
      JOIN stock_batches sb ON sb.id = sl.batch_id
      WHERE sl.sale_id = ?
    `)
    .all(saleId);

  const settings = db.prepare("SELECT * FROM pharmacy_settings WHERE id = 1").get() as SettingsRow;

  return { sale, lines, settings };
}
