import { Router } from "express";
import multer from "multer";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getMophCheck, storeMophCheck } from "../services/mophCheckCache.js";
import { MOPH_COLUMN_SPECS, MOPH_FILE_ROLES } from "../services/mophFields.js";
import {
  analyzeMophRows,
  fetchMophCatalogBundle,
  fetchMophPriceList,
  importMophRows,
  MOPH_LIST_PAGE_URL,
  parseMophBuffers,
  parseMophWorkbook,
  resolveMophDataSources,
} from "../services/mophImport.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const catalogUpload = upload.fields([
  { name: "marketed", maxCount: 1 },
  { name: "nonMarketed", maxCount: 1 },
  { name: "primaryRegistered", maxCount: 1 },
]);

function getExchangeRate(): number {
  const row = db.prepare("SELECT exchange_rate FROM pharmacy_settings WHERE id = 1").get() as {
    exchange_rate: number;
  };
  return row?.exchange_rate ?? 89500;
}

function getMophStatus() {
  try {
    return db
      .prepare(
        `SELECT moph_price_list_url, moph_catalog_list_url, moph_last_import_at, moph_last_import_source
         FROM pharmacy_settings WHERE id = 1`,
      )
      .get() as {
      moph_price_list_url: string | null;
      moph_catalog_list_url: string | null;
      moph_last_import_at: string | null;
      moph_last_import_source: string | null;
    };
  } catch {
    return {
      moph_price_list_url: null,
      moph_catalog_list_url: null,
      moph_last_import_at: null,
      moph_last_import_source: null,
    };
  }
}

function checkResponse(
  checkId: string,
  analysis: ReturnType<typeof analyzeMophRows>,
  meta: {
    sourceUrl: string;
    syncMode: "catalog" | "prices_only";
    marketedCount?: number;
    nonMarketedCount?: number;
    primaryCount?: number;
    rowsCompared: number;
    skippedUnmapped: number;
    sources?: Awaited<ReturnType<typeof resolveMophDataSources>> | null;
  },
) {
  return {
    checkId,
    sourceUrl: meta.sourceUrl,
    listPageUrl: MOPH_LIST_PAGE_URL,
    sources: meta.sources ?? null,
    syncMode: meta.syncMode,
    marketedCount: meta.marketedCount ?? 0,
    nonMarketedCount: meta.nonMarketedCount ?? 0,
    primaryCount: meta.primaryCount ?? 0,
    totalInFile: meta.rowsCompared,
    rowsCompared: meta.rowsCompared,
    skippedUnmapped: meta.skippedUnmapped,
    newProducts: analysis.newProducts,
    priceChanges: analysis.priceChanges,
    unchanged: analysis.unchanged,
    notInCatalog: analysis.notInCatalog,
    sampleChanges: analysis.sampleChanges,
    columnSpecs: MOPH_COLUMN_SPECS,
    fileRoles: MOPH_FILE_ROLES,
  };
}

router.get("/status", requireAuth, async (_req, res) => {
  const status = getMophStatus();
  const sources = await resolveMophDataSources().catch(() => null);
  return res.json({
    ...status,
    list_page_url: MOPH_LIST_PAGE_URL,
    column_specs: MOPH_COLUMN_SPECS,
    file_roles: MOPH_FILE_ROLES,
    sources,
  });
});

/** Build catalog from WebMarketed + WebNonMarketed + primary registered (upload or MoPH download). */
router.post("/catalog/check", requireAuth, catalogUpload, async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[] | undefined>;
    let bundle;

    if (files?.marketed?.[0] || files?.nonMarketed?.[0] || files?.primaryRegistered?.[0]) {
      bundle = parseMophBuffers({
        marketed: files.marketed?.[0]?.buffer,
        nonMarketed: files.nonMarketed?.[0]?.buffer,
        primaryRegistered: files.primaryRegistered?.[0]?.buffer,
      });
    } else {
      const fetched = await fetchMophCatalogBundle();
      bundle = {
        rows: fetched.rows,
        marketedCount: fetched.marketedCount,
        nonMarketedCount: fetched.nonMarketedCount,
        primaryCount: fetched.primaryCount,
        skipped: fetched.skipped,
      };
    }

    const maxRows = Number(req.body?.maxRows);
    let rows = bundle.rows;
    if (maxRows > 0) rows = rows.slice(0, maxRows);

    const analysis = analyzeMophRows(db, rows, getExchangeRate());
    const checkId = storeMophCheck(rows, {
      sourceUrl: "moph:catalog-bundle",
      sourceLabel: `catalog:M${bundle.marketedCount}/NM${bundle.nonMarketedCount}/P${bundle.primaryCount}`,
    });

    return res.json(
      checkResponse(checkId, analysis, {
        sourceUrl: "moph:catalog-bundle",
        syncMode: "catalog",
        marketedCount: bundle.marketedCount,
        nonMarketedCount: bundle.nonMarketedCount,
        primaryCount: bundle.primaryCount,
        rowsCompared: rows.length,
        skippedUnmapped: bundle.skipped,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog check failed";
    return res.status(400).json({ error: message });
  }
});

router.post("/catalog/apply", requireAuth, (req, res) => {
  const checkId = typeof req.body?.checkId === "string" ? req.body.checkId : "";
  const applyRetailPrices =
    req.body?.applyRetailPrices !== false && req.body?.applyRetailPrices !== "false";

  if (!checkId) {
    return res.status(400).json({ error: "Missing checkId. Run catalog check first." });
  }

  const cached = getMophCheck(checkId);
  if (!cached) {
    return res.status(410).json({ error: "Preview expired. Run catalog check again." });
  }

  try {
    const stats = importMophRows(db, cached.rows, {
      exchangeRate: getExchangeRate(),
      applyRetailPrices,
      userId: req.user?.userId,
      sourceLabel: cached.sourceLabel,
      pricesOnly: false,
    });
    return res.json({ ...stats, source: cached.sourceLabel, applyRetailPrices, syncMode: "catalog" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog import failed";
    return res.status(400).json({ error: message });
  }
});

/** Price sync: WebMarketed public price list only (when MoPH publishes updates). */
router.post("/check", requireAuth, async (req, res) => {
  try {
    const price = await fetchMophPriceList();
    let rows = price.rows;
    const maxRows = Number(req.body?.maxRows);
    if (maxRows > 0) rows = rows.slice(0, maxRows);

    const analysis = analyzeMophRows(db, rows, getExchangeRate());
    const checkId = storeMophCheck(rows, {
      sourceUrl: price.sources.marketedUrl ?? "moph:marketed",
      sourceLabel: `prices:WebMarketed:${rows.length}`,
    });

    if (price.sources.marketedUrl) {
      db.prepare(
        `UPDATE pharmacy_settings SET moph_price_list_url = ?, updated_at = datetime('now') WHERE id = 1`,
      ).run(price.sources.marketedUrl);
    }

    return res.json(
      checkResponse(checkId, analysis, {
        sourceUrl: price.sources.marketedUrl ?? "",
        syncMode: "prices_only",
        marketedCount: rows.length,
        rowsCompared: rows.length,
        skippedUnmapped: price.skipped,
        sources: price.sources,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price check failed";
    return res.status(400).json({ error: message });
  }
});

router.post("/apply", requireAuth, (req, res) => {
  const checkId = typeof req.body?.checkId === "string" ? req.body.checkId : "";
  const applyRetailPrices =
    req.body?.applyRetailPrices !== false && req.body?.applyRetailPrices !== "false";

  if (!checkId) {
    return res.status(400).json({ error: "Missing checkId. Run price check first." });
  }

  const cached = getMophCheck(checkId);
  if (!cached) {
    return res.status(410).json({ error: "Preview expired. Run price check again." });
  }

  try {
    const stats = importMophRows(db, cached.rows, {
      exchangeRate: getExchangeRate(),
      applyRetailPrices,
      userId: req.user?.userId,
      sourceLabel: cached.sourceLabel,
      pricesOnly: true,
    });
    return res.json({ ...stats, source: cached.sourceLabel, applyRetailPrices, syncMode: "prices_only" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price update failed";
    return res.status(400).json({ error: message });
  }
});

router.post("/check-upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: "Choose a MoPH Excel file." });
  }

  try {
    const parsed = parseMophWorkbook(req.file.buffer, { requirePublicPrice: false });
    const rows = parsed.rows;
    const analysis = analyzeMophRows(db, rows, getExchangeRate());
    const sourceUrl = `upload:${req.file.originalname}`;
    const checkId = storeMophCheck(rows, { sourceUrl, sourceLabel: sourceUrl });

    return res.json(
      checkResponse(checkId, analysis, {
        sourceUrl,
        syncMode: "prices_only",
        marketedCount: rows.filter((r) => r.category === "marketed").length,
        nonMarketedCount: rows.filter((r) => r.category === "non-marketed").length,
        rowsCompared: rows.length,
        skippedUnmapped: parsed.skipped,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read file";
    return res.status(400).json({ error: message });
  }
});

export default router;
