import crypto from "crypto";
import * as XLSX from "xlsx";
import type Database from "better-sqlite3";
import { MOPH_COLUMN_SPECS, type MophDataSources, type MophListKind } from "./mophFields.js";

export type MophParsedRow = {
  moph_code: string;
  brand_name: string;
  name: string;
  generic_name: string | null;
  strength: string | null;
  presentation: string | null;
  dosage_form: string | null;
  manufacturer: string | null;
  agent: string | null;
  atc_code: string | null;
  moph_registration: string | null;
  country_of_origin: string | null;
  subsidy_percent: number | null;
  official_price_lbp: number | null;
  pharmacist_margin: number | null;
  stratum: string | null;
  category: string | null;
};

export type MophParseResult = {
  sheetName: string;
  headerRowIndex: number;
  detectedColumns: Record<string, string | null>;
  rows: MophParsedRow[];
  skipped: number;
};

export type MophImportStats = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  priceUpdates: number;
  notInCatalog?: number;
};

type MophFieldKey = keyof Omit<MophParsedRow, "name" | "official_price_lbp">;

const EXACT_HEADER_MAP: Partial<Record<MophFieldKey, string>> = {
  moph_code: normalizeHeaderStatic(MOPH_COLUMN_SPECS.moph_code.excel),
  moph_registration: normalizeHeaderStatic(MOPH_COLUMN_SPECS.moph_registration.excel),
  brand_name: normalizeHeaderStatic(MOPH_COLUMN_SPECS.brand_name.excel),
  strength: normalizeHeaderStatic(MOPH_COLUMN_SPECS.strength.excel),
  presentation: normalizeHeaderStatic(MOPH_COLUMN_SPECS.presentation.excel),
  dosage_form: normalizeHeaderStatic(MOPH_COLUMN_SPECS.dosage_form.excel),
  agent: normalizeHeaderStatic(MOPH_COLUMN_SPECS.agent.excel),
  manufacturer: normalizeHeaderStatic(MOPH_COLUMN_SPECS.manufacturer.excel),
  country_of_origin: normalizeHeaderStatic(MOPH_COLUMN_SPECS.country_of_origin.excel),
  pharmacist_margin: normalizeHeaderStatic(MOPH_COLUMN_SPECS.pharmacist_margin.excel),
  stratum: normalizeHeaderStatic(MOPH_COLUMN_SPECS.stratum.excel),
};

const PRICE_EXACT = normalizeHeaderStatic(MOPH_COLUMN_SPECS.official_price_lbp.excel);

const COLUMN_ALIASES: Record<MophFieldKey, string[]> = {
  moph_code: ["moph code", "mophcode", "drug code", "moph no", "moph #"],
  brand_name: ["brand name and strength", "brand name", "trade name"],
  generic_name: ["generic name", "generic", "inn", "active ingredient"],
  strength: ["dosage strength", "potency"],
  presentation: ["pack size", "packaging"],
  dosage_form: ["pharmaceutical form", "dosage form", "pharm form"],
  manufacturer: ["manufacturing company", "maker"],
  agent: ["local agent", "importing agent", "distributor"],
  atc_code: ["atc", "atc code"],
  moph_registration: ["moph registration", "reg no", "registration no", "moph reg"],
  country_of_origin: ["country of origin", "origin"],
  subsidy_percent: ["subsidy", "subsidy %", "subsidy percent"],
  pharmacist_margin: ["pharmacist margin %"],
  stratum: ["stratum class"],
  category: ["route", "registration status", "category", "class"],
};

const PRICE_ALIASES = [
  "public price ll",
  "public price",
  "public price lbp",
  "price lbp",
  "selling price",
  "public price (lbp)",
  "official price",
  "moph price",
];

const NOT_MARKETED_ALIASES = ["not_marketed", "not marketed", "non marketed"];

function normalizeHeaderStatic(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^\w %()/-]/g, "");
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^\w %()/-]/g, "");
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function parsePriceLbp(value: unknown): number | null {
  const raw = cellText(value).replace(/,/g, "").replace(/lbp/gi, "").trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function parsePercent(value: unknown): number | null {
  const raw = cellText(value).replace(/%/g, "").trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function findHeaderRowIndex(matrix: unknown[][]): number {
  let bestIdx = 0;
  let bestScore = 0;

  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = matrix[i] ?? [];
    const headers = row.map(normalizeHeader);
    let score = 0;
    for (const h of headers) {
      if (!h) continue;
      if (PRICE_ALIASES.some((p) => h.includes(p))) score += 2;
      if (h === EXACT_HEADER_MAP.moph_code || h === PRICE_EXACT) score += 2;
      if (h === EXACT_HEADER_MAP.brand_name) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function matchColumn(headers: string[], aliases: string[], exact?: string): string | null {
  if (exact && headers.includes(exact)) {
    return exact;
  }
  for (const alias of aliases) {
    if (alias.length < 3) continue;
    for (const header of headers) {
      if (header === alias || header.includes(alias)) {
        return header;
      }
    }
  }
  return null;
}

function buildColumnMap(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {
    price_lbp: headers.includes(PRICE_EXACT) ? PRICE_EXACT : matchColumn(headers, PRICE_ALIASES),
  };
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [MophFieldKey, string[]][]) {
    map[field] = matchColumn(headers, aliases, EXACT_HEADER_MAP[field]);
  }
  if (!map.brand_name) {
    map.brand_name = matchColumn(headers, ["drug name", "product name", "name", "description"]);
  }
  if (!map.moph_code) {
    map.moph_code = matchColumn(headers, ["code"]);
  }
  return map;
}

function readCell(row: Record<string, unknown>, column: string | null): unknown {
  if (!column) return "";
  return row[column] ?? "";
}

function buildDisplayName(parts: {
  brand: string;
  strength: string;
  presentation: string;
  form: string;
}): string {
  let name = parts.brand;
  if (parts.strength && !name.toLowerCase().includes(parts.strength.toLowerCase())) {
    name = `${name} ${parts.strength}`.trim();
  }
  if (parts.presentation) {
    name = `${name} ${parts.presentation}`.trim();
  }
  if (parts.form && !name.toLowerCase().includes(parts.form.toLowerCase().slice(0, 12))) {
    name = `${name} — ${parts.form}`.trim();
  }
  return name;
}

function syntheticMophCode(brand: string, strength: string, presentation: string, form: string): string {
  const key = [brand, strength, presentation, form]
    .map((part) => part.toLowerCase().trim())
    .join("|");
  const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
  return `PR-${hash}`;
}

export function parseMophWorkbook(
  buffer: Buffer,
  options: {
    requirePublicPrice?: boolean;
    allowSyntheticCode?: boolean;
    listKind?: MophListKind;
  } = {},
): MophParseResult {
  const requirePublicPrice = options.requirePublicPrice === true;
  const allowSyntheticCode = options.allowSyntheticCode === true;
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      sheetName: "",
      headerRowIndex: 0,
      detectedColumns: {},
      rows: [],
      skipped: 0,
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headerCells = (matrix[headerRowIndex] ?? []).map((cell) => normalizeHeader(cell));
  const uniqueHeaders = headerCells.map((h, idx) => h || `column_${idx}`);
  const columnMap = buildColumnMap(uniqueHeaders);

  const rows: MophParsedRow[] = [];
  let skipped = 0;

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const line = matrix[i] ?? [];
    if (line.every((cell) => !cellText(cell))) continue;

    const record: Record<string, unknown> = {};
    uniqueHeaders.forEach((header, idx) => {
      record[header] = line[idx];
    });

    let moph_code = cellText(readCell(record, columnMap.moph_code));
    const brand_name = cellText(readCell(record, columnMap.brand_name));
    const strength = cellText(readCell(record, columnMap.strength)) || null;
    const presentation = cellText(readCell(record, columnMap.presentation)) || null;
    const dosage_form = cellText(readCell(record, columnMap.dosage_form)) || null;
    const name = buildDisplayName({
      brand: brand_name,
      strength: strength ?? "",
      presentation: presentation ?? "",
      form: dosage_form ?? "",
    });
    const official_price_lbp = parsePriceLbp(readCell(record, columnMap.price_lbp));
    const marginRaw = cellText(readCell(record, columnMap.pharmacist_margin));
    const pharmacist_margin = marginRaw ? Number(marginRaw.replace(/,/g, "")) : null;

    if (!brand_name) {
      skipped += 1;
      continue;
    }

    if (!moph_code && allowSyntheticCode) {
      moph_code = syntheticMophCode(brand_name, strength ?? "", presentation ?? "", dosage_form ?? "");
    }

    if (!moph_code) {
      skipped += 1;
      continue;
    }
    if (requirePublicPrice && official_price_lbp == null) {
      skipped += 1;
      continue;
    }

    const notMarketed = cellText(readCell(record, matchColumn(uniqueHeaders, NOT_MARKETED_ALIASES)));
    let category = cellText(readCell(record, columnMap.category)) || null;
    if (options.listKind === "web_non_marketed" || notMarketed) {
      category = "non-marketed";
    } else if (options.listKind === "web_marketed") {
      category = category ?? "marketed";
    } else if (options.listKind === "primary_registered") {
      category = category ?? "primary-registered";
    }

    rows.push({
      moph_code,
      brand_name: brand_name.slice(0, 200),
      name: name.slice(0, 300),
      generic_name: cellText(readCell(record, columnMap.generic_name)) || null,
      strength,
      presentation,
      dosage_form,
      manufacturer: cellText(readCell(record, columnMap.manufacturer)) || null,
      agent: cellText(readCell(record, columnMap.agent)) || null,
      atc_code: cellText(readCell(record, columnMap.atc_code)) || null,
      moph_registration: cellText(readCell(record, columnMap.moph_registration)) || null,
      country_of_origin: cellText(readCell(record, columnMap.country_of_origin)) || null,
      subsidy_percent: parsePercent(readCell(record, columnMap.subsidy_percent)),
      official_price_lbp,
      pharmacist_margin: Number.isFinite(pharmacist_margin) ? pharmacist_margin : null,
      stratum: cellText(readCell(record, columnMap.stratum)) || null,
      category,
    });
  }

  return {
    sheetName,
    headerRowIndex,
    detectedColumns: columnMap,
    rows,
    skipped,
  };
}

export function importMophRows(
  database: Database.Database,
  rows: MophParsedRow[],
  options: {
    exchangeRate: number;
    applyRetailPrices: boolean;
    userId?: number;
    sourceLabel: string;
    /** Public Price List workflow: only update existing products, never insert */
    pricesOnly?: boolean;
  },
): MophImportStats {
  const today = new Date().toISOString().slice(0, 10);
  const rate = options.exchangeRate > 0 ? options.exchangeRate : 89500;

  const findByMoph = database.prepare(
    "SELECT id, sale_price_usd FROM products WHERE moph_code = ?",
  );
  const insert = database.prepare(`
    INSERT INTO products (
      barcode, name, category, sale_price_usd, is_active,
      moph_code, official_price_lbp, last_price_update_date,
      brand_name, generic_name, strength, presentation, dosage_form,
      manufacturer, agent, atc_code, moph_registration, country_of_origin,
      subsidy_percent, pharmacist_margin, stratum
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const update = database.prepare(`
    UPDATE products SET
      name = ?,
      brand_name = ?,
      category = ?,
      official_price_lbp = COALESCE(?, official_price_lbp),
      last_price_update_date = CASE WHEN ? IS NOT NULL THEN ? ELSE last_price_update_date END,
      generic_name = ?,
      strength = ?,
      presentation = ?,
      dosage_form = ?,
      manufacturer = ?,
      agent = ?,
      atc_code = ?,
      moph_registration = ?,
      country_of_origin = ?,
      subsidy_percent = ?,
      pharmacist_margin = COALESCE(?, pharmacist_margin),
      stratum = COALESCE(?, stratum),
      sale_price_usd = CASE WHEN ? AND ? IS NOT NULL THEN ? ELSE sale_price_usd END,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  const stats: MophImportStats = {
    parsed: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    priceUpdates: 0,
    notInCatalog: 0,
  };

  const pricesOnly = options.pricesOnly === true;

  const tx = database.transaction(() => {
    for (const row of rows) {
      const hasPrice = row.official_price_lbp != null && row.official_price_lbp > 0;
      const saleUsd = hasPrice
        ? Math.round((row.official_price_lbp! / rate) * 10000) / 10000
        : 0;
      const existing = findByMoph.get(row.moph_code) as { id: number; sale_price_usd: number } | undefined;

      if (!existing) {
        if (pricesOnly) {
          stats.notInCatalog = (stats.notInCatalog ?? 0) + 1;
          continue;
        }
      }

      if (existing) {
        const priceChanged =
          hasPrice &&
          options.applyRetailPrices &&
          Math.abs(existing.sale_price_usd - saleUsd) > 0.0001;
        update.run(
          row.name,
          row.brand_name,
          row.category,
          row.official_price_lbp,
          row.official_price_lbp,
          today,
          row.generic_name,
          row.strength,
          row.presentation,
          row.dosage_form,
          row.manufacturer,
          row.agent,
          row.atc_code,
          row.moph_registration,
          row.country_of_origin,
          row.subsidy_percent,
          row.pharmacist_margin,
          row.stratum,
          options.applyRetailPrices && hasPrice ? 1 : 0,
          hasPrice ? saleUsd : null,
          hasPrice ? saleUsd : null,
          existing.id,
        );
        stats.updated += 1;
        if (priceChanged) stats.priceUpdates += 1;
      } else {
        try {
          insert.run(
            null,
            row.name,
            row.category,
            saleUsd,
            row.moph_code,
            row.official_price_lbp,
            hasPrice ? today : null,
            row.brand_name,
            row.generic_name,
            row.strength,
            row.presentation,
            row.dosage_form,
            row.manufacturer,
            row.agent,
            row.atc_code,
            row.moph_registration,
            row.country_of_origin,
            row.subsidy_percent,
            row.pharmacist_margin,
            row.stratum,
          );
          stats.created += 1;
        } catch {
          stats.skipped += 1;
        }
      }
    }

    database
      .prepare(`
        UPDATE pharmacy_settings
        SET moph_last_import_at = datetime('now'),
            moph_last_import_source = ?,
            updated_at = datetime('now')
        WHERE id = 1
      `)
      .run(options.sourceLabel);

    if (options.userId) {
      database
        .prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'moph_import', 'products', NULL, ?)
        `)
        .run(
          options.userId,
          JSON.stringify({
            created: stats.created,
            updated: stats.updated,
            skipped: stats.skipped,
            applyRetailPrices: options.applyRetailPrices,
            source: options.sourceLabel,
          }),
        );
    }
  });

  tx();
  return stats;
}

export const MOPH_LIST_PAGE_URL =
  "https://moph.gov.lb/en/Pages/3/3101/drugs-public-price-list-";

export const DEFAULT_MOPH_URL =
  "https://moph.gov.lb/userfiles/files/HealthCareSystem/Pharmaceuticals/DrugsPublicPriceList/3-4-2025/WebMarketed3-4-2025.xls";

export type MophChangeSample = {
  type: "new" | "price_change";
  moph_code: string;
  name: string;
  official_price_lbp: number | null;
  new_sale_price_usd: number;
  previous_official_price_lbp: number | null;
  previous_sale_price_usd: number | null;
};

export type MophCheckAnalysis = {
  newProducts: number;
  priceChanges: number;
  unchanged: number;
  notInCatalog: number;
  sampleChanges: MophChangeSample[];
};

export function classifyMophFileUrl(url: string): MophListKind {
  const lower = url.toLowerCase();
  if (lower.includes("webnonmarketed") || lower.includes("nonmarketed")) return "web_non_marketed";
  if (lower.includes("webmarketed")) return "web_marketed";
  if (lower.includes("primary") && lower.includes("registered")) return "primary_registered";
  return "unknown";
}

export function classifyMophFilename(filename: string): MophListKind {
  return classifyMophFileUrl(filename);
}

function absolutizeMophUrl(url: string): string {
  let absolute = url.replace(/&amp;/g, "&");
  if (absolute.startsWith("/")) {
    absolute = `https://moph.gov.lb${absolute}`;
  } else if (!absolute.startsWith("http")) {
    absolute = `https://moph.gov.lb/${absolute}`;
  }
  return absolute;
}

export async function resolveMophDataSources(): Promise<MophDataSources> {
  const discovered: MophDataSources["discovered"] = [];
  let marketedUrl: string | null = null;
  let nonMarketedUrl: string | null = null;
  let primaryRegisteredUrl: string | null = null;

  try {
    const response = await fetch(MOPH_LIST_PAGE_URL, {
      headers: { "User-Agent": "PharmaCore/0.1 (pharmacy MoPH sync)" },
    });
    if (response.ok) {
      const html = await response.text();
      const pattern = /href=["']([^"']+\.(?:xls|xlsx)(?:[^"']*)?)["']/gi;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        const url = absolutizeMophUrl(match[1]);
        const kind = classifyMophFileUrl(url);
        if (kind === "unknown") continue;
        const label =
          kind === "web_marketed"
            ? "WebMarketed"
            : kind === "web_non_marketed"
              ? "WebNonMarketed"
              : "Primary registered";
        if (!discovered.some((d) => d.url === url)) {
          discovered.push({ url, kind, label });
        }
        if (kind === "web_marketed" && !marketedUrl) marketedUrl = url;
        if (kind === "web_non_marketed" && !nonMarketedUrl) nonMarketedUrl = url;
        if (kind === "primary_registered" && !primaryRegisteredUrl) {
          primaryRegisteredUrl = url;
        }
      }
    }
  } catch {
    /* fall through to defaults */
  }

  if (!marketedUrl) {
    marketedUrl = DEFAULT_MOPH_URL;
    discovered.unshift({
      url: DEFAULT_MOPH_URL,
      kind: "web_marketed",
      label: "WebMarketed (fallback)",
    });
  }

  return {
    listPageUrl: MOPH_LIST_PAGE_URL,
    marketedUrl,
    nonMarketedUrl,
    primaryRegisteredUrl,
    priceListUrl: marketedUrl,
    catalogListUrl: primaryRegisteredUrl,
    discovered,
  };
}

export async function resolveLatestMophListUrl(): Promise<string> {
  const sources = await resolveMophDataSources();
  return sources.priceListUrl ?? DEFAULT_MOPH_URL;
}

export function mergeMophRows(priceRows: MophParsedRow[], catalogRows: MophParsedRow[]): MophParsedRow[] {
  const byCode = new Map<string, MophParsedRow>();

  for (const row of catalogRows) {
    byCode.set(row.moph_code, row);
  }

  for (const row of priceRows) {
    const existing = byCode.get(row.moph_code);
    if (existing) {
      byCode.set(row.moph_code, {
        ...existing,
        ...row,
        brand_name: row.brand_name || existing.brand_name,
        name: row.name || existing.name,
        official_price_lbp: row.official_price_lbp ?? existing.official_price_lbp,
        pharmacist_margin: row.pharmacist_margin ?? existing.pharmacist_margin,
        stratum: row.stratum ?? existing.stratum,
      });
    } else {
      byCode.set(row.moph_code, row);
    }
  }

  return [...byCode.values()];
}

async function downloadAndParse(url: string, kind: MophListKind): Promise<MophParseResult> {
  const buffer = await fetchMophFile(url);
  return parseMophWorkbook(buffer, {
    requirePublicPrice: kind === "web_marketed",
    allowSyntheticCode: kind === "primary_registered",
    listKind: kind,
  });
}

export function parseMophBuffers(files: {
  marketed?: Buffer;
  nonMarketed?: Buffer;
  primaryRegistered?: Buffer;
}): {
  rows: MophParsedRow[];
  marketedCount: number;
  nonMarketedCount: number;
  primaryCount: number;
  skipped: number;
} {
  let marketed: MophParsedRow[] = [];
  let nonMarketed: MophParsedRow[] = [];
  let primary: MophParsedRow[] = [];
  let skipped = 0;

  if (files.marketed) {
    const p = parseMophWorkbook(files.marketed, { listKind: "web_marketed" });
    marketed = p.rows;
    skipped += p.skipped;
  }
  if (files.nonMarketed) {
    const p = parseMophWorkbook(files.nonMarketed, {
      requirePublicPrice: false,
      listKind: "web_non_marketed",
    });
    nonMarketed = p.rows;
    skipped += p.skipped;
  }
  if (files.primaryRegistered) {
    const p = parseMophWorkbook(files.primaryRegistered, {
      requirePublicPrice: false,
      allowSyntheticCode: true,
      listKind: "primary_registered",
    });
    primary = p.rows;
    skipped += p.skipped;
  }

  const rows = mergeMophRows(mergeMophRows(marketed, nonMarketed), primary);

  return {
    rows,
    marketedCount: marketed.length,
    nonMarketedCount: nonMarketed.length,
    primaryCount: primary.length,
    skipped,
  };
}

/** WebMarketed only — for periodic public price updates (resolution / exchange rate). */
export async function fetchMophPriceList(): Promise<{
  rows: MophParsedRow[];
  sources: MophDataSources;
  skipped: number;
}> {
  const sources = await resolveMophDataSources();
  if (!sources.marketedUrl) {
    throw new Error("No WebMarketed price list found on MoPH site.");
  }
  const parsed = await downloadAndParse(sources.marketedUrl, "web_marketed");
  return { rows: parsed.rows, sources, skipped: parsed.skipped };
}

/** All three lists: coded catalog (marketed + non-marketed) + primary registered. */
export async function fetchMophCatalogBundle(): Promise<{
  rows: MophParsedRow[];
  sources: MophDataSources;
  marketedCount: number;
  nonMarketedCount: number;
  primaryCount: number;
  skipped: number;
}> {
  const sources = await resolveMophDataSources();
  let marketed: MophParsedRow[] = [];
  let nonMarketed: MophParsedRow[] = [];
  let primary: MophParsedRow[] = [];
  let skipped = 0;

  if (sources.marketedUrl) {
    try {
      const p = await downloadAndParse(sources.marketedUrl, "web_marketed");
      marketed = p.rows;
      skipped += p.skipped;
    } catch (e) {
      console.warn("WebMarketed download failed:", e);
    }
  }
  if (sources.nonMarketedUrl) {
    try {
      const p = await downloadAndParse(sources.nonMarketedUrl, "web_non_marketed");
      nonMarketed = p.rows;
      skipped += p.skipped;
    } catch (e) {
      console.warn("WebNonMarketed download failed:", e);
    }
  }
  if (sources.primaryRegisteredUrl) {
    try {
      const p = await downloadAndParse(sources.primaryRegisteredUrl, "primary_registered");
      primary = p.rows;
      skipped += p.skipped;
    } catch (e) {
      console.warn("Primary registered download failed:", e);
    }
  }

  const rows = mergeMophRows(mergeMophRows(marketed, nonMarketed), primary);

  return {
    rows,
    sources,
    marketedCount: marketed.length,
    nonMarketedCount: nonMarketed.length,
    primaryCount: primary.length,
    skipped,
  };
}

/** @deprecated use fetchMophPriceList or fetchMophCatalogBundle */
export async function fetchFullMophCatalog() {
  const bundle = await fetchMophCatalogBundle();
  return {
    rows: bundle.rows,
    sources: bundle.sources,
    priceRowCount: bundle.marketedCount,
    catalogRowCount: bundle.nonMarketedCount + bundle.primaryCount,
    skipped: bundle.skipped,
  };
}

export function analyzeMophRows(
  database: Database.Database,
  rows: MophParsedRow[],
  exchangeRate: number,
): MophCheckAnalysis {
  const rate = exchangeRate > 0 ? exchangeRate : 89500;
  const findByMoph = database.prepare(`
    SELECT id, name, sale_price_usd, official_price_lbp
    FROM products WHERE moph_code = ?
  `);

  let newProducts = 0;
  let priceChanges = 0;
  let unchanged = 0;
  let notInCatalog = 0;
  const sampleChanges: MophChangeSample[] = [];

  function pushSample(entry: MophChangeSample) {
    if (sampleChanges.length >= 30) return;
    sampleChanges.push(entry);
  }

  for (const row of rows) {
    const hasPrice = row.official_price_lbp != null && row.official_price_lbp > 0;
    const newSaleUsd = hasPrice
      ? Math.round((row.official_price_lbp! / rate) * 10000) / 10000
      : 0;
    const existing = findByMoph.get(row.moph_code) as
      | { id: number; name: string; sale_price_usd: number; official_price_lbp: number | null }
      | undefined;

    if (!existing) {
      notInCatalog += 1;
      newProducts += 1;
      pushSample({
        type: "new",
        moph_code: row.moph_code,
        name: row.name,
        official_price_lbp: row.official_price_lbp,
        new_sale_price_usd: newSaleUsd,
        previous_official_price_lbp: null,
        previous_sale_price_usd: null,
      });
      continue;
    }

    const prevLbp = existing.official_price_lbp ?? 0;
    const newLbp = row.official_price_lbp ?? 0;
    const lbpChanged = hasPrice && Math.abs(prevLbp - newLbp) > 0.01;
    const usdChanged = hasPrice && Math.abs(existing.sale_price_usd - newSaleUsd) > 0.0001;

    if (lbpChanged || usdChanged) {
      priceChanges += 1;
      pushSample({
        type: "price_change",
        moph_code: row.moph_code,
        name: row.name,
        official_price_lbp: row.official_price_lbp,
        new_sale_price_usd: newSaleUsd,
        previous_official_price_lbp: existing.official_price_lbp,
        previous_sale_price_usd: existing.sale_price_usd,
      });
    } else {
      unchanged += 1;
    }
  }

  return { newProducts, priceChanges, unchanged, notInCatalog, sampleChanges };
}

export async function fetchMophFile(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "PharmaCore/0.1 (pharmacy import)" },
  });
  if (!response.ok) {
    throw new Error(`MoPH download failed (${response.status}). Check the URL or upload the file manually.`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 5000) {
    throw new Error("Downloaded file is too small — the site may have returned an error page. Upload the .xls file manually.");
  }
  return buffer;
}
