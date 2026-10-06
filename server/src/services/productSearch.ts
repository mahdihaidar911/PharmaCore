import { db, type ProductRow } from "../db/index.js";

export type ProductSearchRow = ProductRow & { total_qty: number };

/** Strip control chars (barcode scanners often append CR/LF). */
export function normalizeSearchQuery(raw: string): string {
  return raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Shared product search — same logic for Products list and POS.
 * Stock count matches the Products page (sum of all batch qty).
 */
function searchWhereClause(activeOnly: boolean): string {
  const active = activeOnly ? "IFNULL(p.is_active, 1) = 1 AND " : "";
  return `
    ${active}(
      LOWER(TRIM(p.name)) LIKE ? ESCAPE '\\'
      OR LOWER(TRIM(IFNULL(p.barcode, ''))) LIKE ? ESCAPE '\\'
      OR TRIM(IFNULL(p.barcode, '')) = ?
      OR LOWER(TRIM(IFNULL(p.category, ''))) LIKE ? ESCAPE '\\'
      OR LOWER(TRIM(IFNULL(p.brand_name, ''))) LIKE ? ESCAPE '\\'
      OR TRIM(IFNULL(p.moph_code, '')) = ?
      OR TRIM(IFNULL(p.moph_code, '')) LIKE ? ESCAPE '\\'
      OR CAST(p.id AS TEXT) = ?
    )
  `;
}

function searchBindParams(q: string) {
  const pattern = `%${escapeLike(q.toLowerCase())}%`;
  return [pattern, pattern, q, pattern, pattern, q, pattern, q] as const;
}

export function countSearchProducts(query: string, activeOnly = true): number {
  const q = normalizeSearchQuery(query);
  if (!q) return 0;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total FROM products p WHERE ${searchWhereClause(activeOnly)}`,
    )
    .get(...searchBindParams(q)) as { total: number };
  return row?.total ?? 0;
}

export function searchProductsPage(
  query: string,
  page: number,
  pageSize: number,
  activeOnly = true,
): ProductSearchRow[] {
  const q = normalizeSearchQuery(query);
  if (!q) return [];

  const offset = (page - 1) * pageSize;
  const binds = [...searchBindParams(q), pageSize, offset];

  return db
    .prepare(
      `
      SELECT
        p.*,
        (
          SELECT COALESCE(SUM(sb.qty), 0)
          FROM stock_batches sb
          WHERE sb.product_id = p.id
        ) AS total_qty
      FROM products p
      WHERE ${searchWhereClause(activeOnly)}
      ORDER BY total_qty DESC, TRIM(p.name) ASC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...binds) as ProductSearchRow[];
}

export function searchProducts(query: string, limit = 50): ProductSearchRow[] {
  return searchProductsPage(query, 1, limit, true);
}

const stockQtySql = `
  (
    SELECT COALESCE(SUM(sb.qty), 0)
    FROM stock_batches sb
    WHERE sb.product_id = p.id
  ) AS total_qty
`;

function barcodeLookupVariants(barcode: string): string[] {
  const q = normalizeSearchQuery(barcode);
  if (!q) return [];
  const variants = new Set<string>([q]);
  if (/^\d+$/.test(q)) {
    const noLead = q.replace(/^0+/, "") || "0";
    variants.add(noLead);
    if (q.length < 13) variants.add(q.padStart(13, "0"));
    if (noLead.length < 13) variants.add(noLead.padStart(13, "0"));
  }
  return [...variants];
}

/** Exact barcode match (scanner / EAN). MoPH code is not used as barcode. */
export function findProductByBarcode(barcode: string): ProductSearchRow | undefined {
  const variants = barcodeLookupVariants(barcode);
  if (variants.length === 0) return undefined;

  const stmt = db.prepare(
    `
    SELECT p.*, ${stockQtySql}
    FROM products p
    WHERE IFNULL(p.is_active, 1) = 1
      AND TRIM(IFNULL(p.barcode, '')) = ?
    LIMIT 1
  `,
  );

  for (const code of variants) {
    const row = stmt.get(code) as ProductSearchRow | undefined;
    if (row) return row;
  }
  return undefined;
}

/** POS: exact barcode first, then name/MoPH search (min 2 chars for fuzzy). */
export function searchProductsForPos(query: string, limit = 50): ProductSearchRow[] {
  const q = normalizeSearchQuery(query);
  if (!q) return [];

  const exact = findProductByBarcode(q);
  if (exact) return [exact];

  if (q.length < 2) return [];
  return searchProducts(q, limit);
}

/** Products that currently have stock (for POS quick pick). */
export function listProductsInStock(limit = 50): ProductSearchRow[] {
  return db
    .prepare(
      `
      SELECT
        p.*,
        (
          SELECT COALESCE(SUM(sb.qty), 0)
          FROM stock_batches sb
          WHERE sb.product_id = p.id
        ) AS total_qty
      FROM products p
      WHERE IFNULL(p.is_active, 1) = 1
        AND (
          SELECT COALESCE(SUM(sb2.qty), 0)
          FROM stock_batches sb2
          WHERE sb2.product_id = p.id
        ) > 0
      ORDER BY TRIM(p.name) ASC
      LIMIT ?
    `,
    )
    .all(limit) as ProductSearchRow[];
}

export function toPosProduct(row: ProductSearchRow) {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    category: row.category,
    sale_price_usd: row.sale_price_usd,
    total_qty: Number(row.total_qty) || 0,
  };
}
