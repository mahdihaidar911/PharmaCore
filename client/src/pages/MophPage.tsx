import { useEffect, useState } from "react";
import {
  api,
  formatLbp,
  formatUsd,
  type MophCheckResult,
  type MophStatus,
} from "../lib/api";
import { PageShell, Panel, ScrollBox } from "../components/PageShell";
import { useSettings } from "../context/SettingsContext";

type Step = "idle" | "checking" | "ready" | "applying" | "done";

type CatalogFiles = {
  marketed: File | null;
  nonMarketed: File | null;
  primaryRegistered: File | null;
};

function MophPreview({
  check,
  mode,
  applyRetailPrices,
  onApplyRetailPrices,
  canApply,
  busy,
  applyingLabel,
  applyLabel,
  onApply,
}: {
  check: MophCheckResult;
  mode: "catalog" | "prices_only";
  applyRetailPrices: boolean;
  onApplyRetailPrices: (v: boolean) => void;
  canApply: boolean;
  busy: boolean;
  applyingLabel: string;
  applyLabel: string;
  onApply: () => void;
}) {
  const isCatalog = mode === "catalog";

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/50 space-y-3 p-4">
      <h3 className="font-semibold text-slate-900">Preview</h3>
      <p className="text-sm text-slate-700">
        <strong>{check.rowsCompared.toLocaleString()}</strong> rows in file
        {isCatalog && (check.marketedCount != null || check.nonMarketedCount != null) ? (
          <>
            {" "}
            · marketed {check.marketedCount?.toLocaleString() ?? "—"} · non-marketed{" "}
            {check.nonMarketedCount?.toLocaleString() ?? "—"} · primary registered{" "}
            {check.primaryCount?.toLocaleString() ?? "—"}
          </>
        ) : null}
      </p>
      <ul className="grid gap-2 text-sm sm:grid-cols-3">
        {isCatalog ? (
          <li className="rounded-lg bg-white px-3 py-2">
            <span className="text-slate-500">New products</span>
            <p className="text-lg font-semibold text-emerald-700">{check.newProducts}</p>
          </li>
        ) : null}
        <li className="rounded-lg bg-white px-3 py-2">
          <span className="text-slate-500">{isCatalog ? "Updates" : "Price changes"}</span>
          <p className="text-lg font-semibold text-amber-700">{check.priceChanges}</p>
        </li>
        <li className="rounded-lg bg-white px-3 py-2">
          <span className="text-slate-500">Unchanged</span>
          <p className="text-lg font-semibold text-slate-700">{check.unchanged}</p>
        </li>
        {!isCatalog ? (
          <li className="rounded-lg bg-white px-3 py-2">
            <span className="text-slate-500">Not in your catalog</span>
            <p className="text-lg font-semibold text-slate-600">{check.notInCatalog ?? check.newProducts}</p>
          </li>
        ) : null}
      </ul>
      {!isCatalog && (check.notInCatalog ?? 0) > 0 ? (
        <p className="text-xs text-amber-800">
          {check.notInCatalog} drugs are on the price list but not in PharmaCore — run catalog import first.
        </p>
      ) : null}
      {check.skippedUnmapped > 0 ? (
        <p className="text-xs text-slate-500">{check.skippedUnmapped} rows skipped (missing code/name/price)</p>
      ) : null}

      {check.sampleChanges.length > 0 ? (
        <ScrollBox className="max-h-56 rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Change</th>
                <th className="px-3 py-2 text-left">رقم الوزارة</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">MoPH LBP</th>
                <th className="px-3 py-2 text-right">Shelf USD</th>
              </tr>
            </thead>
            <tbody>
              {check.sampleChanges.map((row) => (
                <tr key={`${row.type}-${row.moph_code}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {row.type === "new" ? (
                      <span className="text-emerald-700">New</span>
                    ) : (
                      <span className="text-amber-700">Price</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.moph_code}</td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-right">
                    {row.type === "price_change" &&
                    row.previous_official_price_lbp != null &&
                    row.official_price_lbp != null ? (
                      <>
                        <span className="text-slate-400 line-through">
                          {formatLbp(row.previous_official_price_lbp)}
                        </span>
                        <br />
                      </>
                    ) : null}
                    {row.official_price_lbp != null ? formatLbp(row.official_price_lbp) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.type === "price_change" && row.previous_sale_price_usd != null ? (
                      <>
                        <span className="text-slate-400 line-through">
                          {formatUsd(row.previous_sale_price_usd)}
                        </span>
                        <br />
                      </>
                    ) : null}
                    {formatUsd(row.new_sale_price_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={applyRetailPrices}
          onChange={(e) => onApplyRetailPrices(e.target.checked)}
        />
        Set shelf prices (USD) from official MoPH LBP ÷ exchange rate
      </label>

      <button
        type="button"
        disabled={!canApply || busy}
        onClick={onApply}
        className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? applyingLabel : applyLabel}
      </button>
    </div>
  );
}

export default function MophPage() {
  const { settings } = useSettings();
  const [status, setStatus] = useState<MophStatus | null>(null);
  const [serverOk, setServerOk] = useState(true);
  const [applyRetailPrices, setApplyRetailPrices] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [catStep, setCatStep] = useState<Step>("idle");
  const [catCheck, setCatCheck] = useState<MophCheckResult | null>(null);
  const [catMessage, setCatMessage] = useState("");
  const [catError, setCatError] = useState("");
  const [catalogFiles, setCatalogFiles] = useState<CatalogFiles>({
    marketed: null,
    nonMarketed: null,
    primaryRegistered: null,
  });

  const [priceStep, setPriceStep] = useState<Step>("idle");
  const [priceCheck, setPriceCheck] = useState<MophCheckResult | null>(null);
  const [priceMessage, setPriceMessage] = useState("");
  const [priceError, setPriceError] = useState("");
  const [priceUploadFile, setPriceUploadFile] = useState<File | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then((h) => setServerOk(Boolean(h.features?.mophImport)))
      .catch(() => setServerOk(false));

    api.getMophStatus().then(setStatus).catch(() => {
      /* optional */
    });
  }, []);

  const catBusy = catStep === "checking" || catStep === "applying";
  const priceBusy = priceStep === "checking" || priceStep === "applying";
  const anyBusy = catBusy || priceBusy;

  async function refreshStatus() {
    const refreshed = await api.getMophStatus().catch(() => null);
    if (refreshed) setStatus(refreshed);
  }

  async function runCatalogCheckFromMoPH() {
    setCatStep("checking");
    setCatError("");
    setCatCheck(null);
    setCatMessage("Downloading marketed, non-marketed, and primary registered lists from MoPH…");

    try {
      const result = await api.checkMophCatalog();
      setCatCheck(result);
      setCatStep("ready");
      setCatMessage("");
    } catch (err) {
      setCatStep("idle");
      setCatMessage("");
      setCatError(err instanceof Error ? err.message : "Catalog check failed");
    }
  }

  async function runCatalogCheckUpload() {
    const { marketed, nonMarketed, primaryRegistered } = catalogFiles;
    if (!marketed && !nonMarketed && !primaryRegistered) {
      setCatError("Choose at least one MoPH file (WebMarketed, WebNonMarketed, or primary registered).");
      return;
    }

    setCatStep("checking");
    setCatError("");
    setCatCheck(null);
    setCatMessage("Reading uploaded files…");

    try {
      const result = await api.checkMophCatalogUpload({ marketed, nonMarketed, primaryRegistered });
      setCatCheck(result);
      setCatStep("ready");
      setCatMessage("");
    } catch (err) {
      setCatStep("idle");
      setCatMessage("");
      setCatError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function runCatalogApply() {
    if (!catCheck?.checkId) return;

    setCatStep("applying");
    setCatError("");

    try {
      const result = await api.applyMophCatalog(catCheck.checkId, applyRetailPrices);
      setCatStep("done");
      setCatCheck(null);
      await refreshStatus();
      setCatMessage(
        `Catalog imported: ${result.created} new, ${result.updated} updated, ${result.priceUpdates} price rows set.`,
      );
    } catch (err) {
      setCatStep("ready");
      setCatError(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function runPriceCheck() {
    setPriceStep("checking");
    setPriceError("");
    setPriceCheck(null);
    setPriceMessage("Finding latest WebMarketed price list on MoPH…");

    try {
      setTimeout(() => {
        setPriceMessage((prev) =>
          prev.includes("Finding") ? "Downloading and comparing prices…" : prev,
        );
      }, 1200);

      const result = await api.checkMophPrices();
      setPriceCheck(result);
      setPriceStep("ready");
      setPriceMessage("");
    } catch (err) {
      setPriceStep("idle");
      setPriceMessage("");
      setPriceError(err instanceof Error ? err.message : "Check failed");
    }
  }

  async function runPriceCheckUpload() {
    if (!priceUploadFile) {
      setPriceError("Choose WebMarketed .xls from MoPH first.");
      return;
    }
    setPriceStep("checking");
    setPriceError("");
    setPriceCheck(null);
    setPriceMessage("Reading uploaded file…");

    try {
      const result = await api.checkMophUpload(priceUploadFile);
      setPriceCheck(result);
      setPriceStep("ready");
      setPriceMessage("");
    } catch (err) {
      setPriceStep("idle");
      setPriceMessage("");
      setPriceError(err instanceof Error ? err.message : "Upload check failed");
    }
  }

  async function runPriceApply() {
    if (!priceCheck?.checkId) return;

    setPriceStep("applying");
    setPriceError("");

    try {
      const result = await api.applyMophCheck(priceCheck.checkId, applyRetailPrices);
      setPriceStep("done");
      setPriceCheck(null);
      await refreshStatus();
      setPriceMessage(
        `Prices updated: ${result.priceUpdates} shelf changes, ${result.updated} products touched.${
          result.notInCatalog
            ? ` ${result.notInCatalog} on MoPH list but not in your catalog (skipped).`
            : ""
        }`,
      );
    } catch (err) {
      setPriceStep("ready");
      setPriceError(err instanceof Error ? err.message : "Update failed");
    }
  }

  const rate = settings?.exchange_rate ?? 89500;

  return (
    <PageShell
      title="MoPH sync"
      description={
        <>
          <strong>Once — catalog:</strong> merge{" "}
          <strong>WebMarketed</strong> (~5.5k, Code + public price),{" "}
          <strong>WebNonMarketed</strong> (~5k, Code, no price), and{" "}
          <strong>primary registered</strong> (~227, no Code — synthetic IDs).{" "}
          <strong>Ongoing — prices:</strong> when MoPH publishes a new list (e.g. 20260505), run{" "}
          <strong>WebMarketed</strong> only to update existing products by رقم الوزارة. Exchange rate:{" "}
          {rate.toLocaleString()} LBP/USD.{" "}
          <a
            href="https://moph.gov.lb/en/Pages/3/3101/drugs-public-price-list-"
            target="_blank"
            rel="noreferrer"
            className="text-teal-700 underline"
          >
            Drugs Public Price List
          </a>
        </>
      }
    >
      <ScrollBox className="flex min-h-0 flex-1 flex-col gap-4">
        {!serverOk ? (
          <p className="shrink-0 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            MoPH API is not available. Close every terminal, open PharmaCore, run{" "}
            <code className="rounded bg-amber-100 px-1">npm run dev</code>, then refresh this page.
          </p>
        ) : null}

        {status?.moph_last_import_at ? (
          <p className="shrink-0 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
            Last import: {new Date(status.moph_last_import_at).toLocaleString()}
            {status.moph_last_import_source ? ` · ${status.moph_last_import_source}` : null}
          </p>
        ) : null}

        <Panel className="shrink-0 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">1. National catalog (one-time)</h2>
          <p className="text-sm text-slate-600">
            You already imported the three files — that is your main database. Re-import only if MoPH adds many
            new drugs or you need a full refresh. Otherwise use section 2 for price updates.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-600">WebMarketed .xls</span>
              <input
                type="file"
                accept=".xls,.xlsx"
                className="mt-1 block w-full text-xs"
                onChange={(e) =>
                  setCatalogFiles((f) => ({ ...f, marketed: e.target.files?.[0] ?? null }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">WebNonMarketed .xls</span>
              <input
                type="file"
                accept=".xls,.xlsx"
                className="mt-1 block w-full text-xs"
                onChange={(e) =>
                  setCatalogFiles((f) => ({ ...f, nonMarketed: e.target.files?.[0] ?? null }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Primary registered .xlsx</span>
              <input
                type="file"
                accept=".xls,.xlsx"
                className="mt-1 block w-full text-xs"
                onChange={(e) =>
                  setCatalogFiles((f) => ({ ...f, primaryRegistered: e.target.files?.[0] ?? null }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={anyBusy || !serverOk}
              onClick={runCatalogCheckUpload}
              className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {catStep === "checking" ? "Checking…" : "Preview from uploads"}
            </button>
            <button
              type="button"
              disabled={anyBusy || !serverOk}
              onClick={runCatalogCheckFromMoPH}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {catStep === "checking" ? "Downloading…" : "Download from MoPH"}
            </button>
          </div>

          {catMessage ? <p className="text-sm text-slate-600">{catMessage}</p> : null}
          {catCheck ? (
            <MophPreview
              check={catCheck}
              mode="catalog"
              applyRetailPrices={applyRetailPrices}
              onApplyRetailPrices={setApplyRetailPrices}
              canApply={catStep === "ready"}
              busy={catBusy}
              applyingLabel="Importing…"
              applyLabel="Import catalog"
              onApply={runCatalogApply}
            />
          ) : null}
          {catStep === "done" && catMessage ? (
            <p className="text-sm text-emerald-800">{catMessage}</p>
          ) : null}
          {catError ? <p className="text-sm text-red-600">{catError}</p> : null}
        </Panel>

        <Panel className="shrink-0 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">2. Public price list (repeat when MoPH updates)</h2>
          <p className="text-xs text-slate-500">
            Uses <strong>WebMarketed</strong> only. Does not add new products — only updates prices for items
            already in your catalog (matched by MoPH code).
          </p>

          <button
            type="button"
            disabled={anyBusy || !serverOk}
            onClick={runPriceCheck}
            className="w-full rounded-xl bg-teal-700 px-6 py-4 text-base font-semibold text-white hover:bg-teal-800 disabled:opacity-50 sm:w-auto"
          >
            {priceStep === "checking" ? "Checking price list…" : "Check public price list"}
          </button>

          {priceMessage ? <p className="text-sm text-slate-600">{priceMessage}</p> : null}

          {priceCheck ? (
            <MophPreview
              check={priceCheck}
              mode="prices_only"
              applyRetailPrices={applyRetailPrices}
              onApplyRetailPrices={setApplyRetailPrices}
              canApply={priceStep === "ready"}
              busy={priceBusy}
              applyingLabel="Updating…"
              applyLabel="Update prices"
              onApply={runPriceApply}
            />
          ) : null}

          {priceStep === "done" && priceMessage ? (
            <p className="text-sm text-emerald-800">{priceMessage}</p>
          ) : null}
          {priceError ? <p className="text-sm text-red-600">{priceError}</p> : null}
        </Panel>

        <div className="shrink-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <button
            type="button"
            className="text-sm font-medium text-slate-600"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide" : "Show"} manual price upload
          </button>
          {showAdvanced ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="block text-sm">
                <span className="text-slate-600">WebMarketed .xls only</span>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  className="mt-1 block text-sm"
                  onChange={(e) => setPriceUploadFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                disabled={anyBusy || !priceUploadFile}
                onClick={runPriceCheckUpload}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
              >
                Check uploaded price file
              </button>
            </div>
          ) : null}
        </div>
      </ScrollBox>
    </PageShell>
  );
}
