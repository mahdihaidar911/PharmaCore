import { useEffect, useState } from "react";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { Icon } from "../components/icons";
import { Alert, FigureRow, StatCard } from "../components/ui";
import { useSettings } from "../context/SettingsContext";
import { api, formatLbp, formatUsd, type MophCheckResult, type MophStatus } from "../lib/api";

type Step = "idle" | "checking" | "ready" | "applying" | "done";

type CatalogFiles = {
  marketed: File | null;
  nonMarketed: File | null;
  primaryRegistered: File | null;
};

function FileField({ label, onFile }: { label: string; onFile: (file: File | null) => void }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        type="file"
        accept=".xls,.xlsx"
        className="block w-full text-dense text-fg-2 file:mr-3 file:cursor-pointer file:rounded-sm file:border file:border-line-input file:bg-surface file:px-3 file:py-1.5 file:text-dense file:font-medium file:text-fg hover:file:bg-surface-2"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

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
    <div className="space-y-3 rounded-md border border-line-strong bg-surface p-4">
      <p className="text-dense text-fg-2">
        <span className="kicker mr-2">Preview</span>
        <strong className="text-fg">{check.rowsCompared.toLocaleString()}</strong> rows in file
        {isCatalog && (check.marketedCount != null || check.nonMarketedCount != null) ? (
          <>
            {" "}
            · marketed {check.marketedCount?.toLocaleString() ?? "—"} · non-marketed {check.nonMarketedCount?.toLocaleString() ?? "—"} · primary registered{" "}
            {check.primaryCount?.toLocaleString() ?? "—"}
          </>
        ) : null}
      </p>
      <FigureRow columns={3}>
        {isCatalog ? <StatCard label="New products" value={check.newProducts.toLocaleString()} /> : null}
        <StatCard label={isCatalog ? "Updates" : "Price changes"} value={check.priceChanges.toLocaleString()} tone={check.priceChanges > 0 ? "warning" : "neutral"} />
        <StatCard label="Unchanged" value={check.unchanged.toLocaleString()} />
        {!isCatalog ? <StatCard label="Not in your catalogue" value={(check.notInCatalog ?? check.newProducts).toLocaleString()} /> : null}
      </FigureRow>
      {!isCatalog && (check.notInCatalog ?? 0) > 0 ? (
        <Alert tone="warning">{check.notInCatalog} drugs are on the price list but not in PharmaCore — run the catalogue import first.</Alert>
      ) : null}
      {check.skippedUnmapped > 0 ? <p className="meta">{check.skippedUnmapped} rows skipped (missing code, name or price).</p> : null}

      {check.sampleChanges.length > 0 ? (
        <ScrollBox className="max-h-64 rounded-sm border border-line">
          <table className="data-table">
            <thead>
              <tr>
                <th>Change</th>
                <th>MoPH code</th>
                <th>Product</th>
                <th className="num">MoPH LBP</th>
                <th className="num">Shelf USD</th>
              </tr>
            </thead>
            <tbody>
              {check.sampleChanges.map((row) => (
                <tr key={`${row.type}-${row.moph_code}`}>
                  <td className="font-medium">{row.type === "new" ? "New" : "Price"}</td>
                  <td className="code text-fg-2">{row.moph_code}</td>
                  <td className="font-medium">{row.name}</td>
                  <td className="num">
                    {row.type === "price_change" && row.previous_official_price_lbp != null && row.official_price_lbp != null ? (
                      <span className="block text-xs text-fg-3 line-through">{formatLbp(row.previous_official_price_lbp)}</span>
                    ) : null}
                    {row.official_price_lbp != null ? formatLbp(row.official_price_lbp) : "—"}
                  </td>
                  <td className="num">
                    {row.type === "price_change" && row.previous_sale_price_usd != null ? (
                      <span className="block text-xs text-fg-3 line-through">{formatUsd(row.previous_sale_price_usd)}</span>
                    ) : null}
                    {formatUsd(row.new_sale_price_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <label className="flex items-center gap-2 text-dense text-fg-2">
          <input type="checkbox" className="h-4 w-4" checked={applyRetailPrices} onChange={(e) => onApplyRetailPrices(e.target.checked)} />
          Set shelf prices (USD) from the official MoPH LBP price ÷ exchange rate
        </label>
        <button type="button" disabled={!canApply || busy} onClick={onApply} className="btn btn-primary">
          {busy ? applyingLabel : applyLabel}
        </button>
      </div>
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
      title="MoPH catalogue"
      description={
        <>
          Import the Ministry of Public Health drug lists once, then refresh public prices whenever MoPH publishes a new list. Rate used:{" "}
          <span className="font-mono">{rate.toLocaleString()} LBP/USD</span>.{" "}
          <a href="https://moph.gov.lb/en/Pages/3/3101/drugs-public-price-list-" target="_blank" rel="noreferrer" className="font-medium text-accent-text underline">
            MoPH public price list
          </a>
        </>
      }
      actions={
        status?.moph_last_import_at ? (
          <p className="meta">
            Last import <span className="code text-fg-2">{new Date(status.moph_last_import_at).toLocaleString()}</span>
            {status.moph_last_import_source ? ` · ${status.moph_last_import_source}` : null}
          </p>
        ) : null
      }
    >
      <ScrollBox className="min-h-0 flex-1">
        <div className="max-w-4xl space-y-8 pb-4">
          {!serverOk ? (
            <Alert tone="warning" title="The MoPH import service is not available">
              Restart PharmaCore (<code className="code">npm run dev</code>), then refresh this page.
            </Alert>
          ) : null}

          <section className="sheet space-y-3 px-4 pt-3 pb-4">
            <SectionHead title="1 · Price list update" count="repeat when MoPH publishes" />
            <p className="text-dense text-fg-2">
              Uses <strong>WebMarketed</strong> only. Updates prices of products already in your catalogue, matched by MoPH code. Never adds products.
            </p>
            <button type="button" disabled={anyBusy || !serverOk} onClick={runPriceCheck} className="btn btn-primary btn-lg">
              {priceStep === "checking" ? "Checking price list…" : "Check public price list"}
            </button>
            {priceMessage && priceStep !== "done" ? <p className="text-dense text-fg-2">{priceMessage}</p> : null}
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
            {priceStep === "done" && priceMessage ? <Alert tone="success">{priceMessage}</Alert> : null}
            {priceError ? <Alert tone="error">{priceError}</Alert> : null}

            <div>
              <button type="button" className="btn btn-ghost btn-sm -ml-2" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
                <Icon name={showAdvanced ? "chevronDown" : "chevronRight"} className="h-4 w-4" />
                Use a downloaded price file instead
              </button>
              {showAdvanced ? (
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <FileField label="WebMarketed .xls" onFile={setPriceUploadFile} />
                  <button type="button" disabled={anyBusy || !priceUploadFile} onClick={runPriceCheckUpload} className="btn btn-secondary">
                    Check uploaded file
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="sheet space-y-3 px-4 pt-3 pb-4">
            <SectionHead title="2 · National catalogue" count="one-time import" />
            <p className="text-dense text-fg-2">
              Merges <strong>WebMarketed</strong> (codes and public prices), <strong>WebNonMarketed</strong> (codes, no price) and the{" "}
              <strong>primary registered</strong> list. Re-import only when MoPH adds many new drugs.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <FileField label="WebMarketed .xls" onFile={(file) => setCatalogFiles((f) => ({ ...f, marketed: file }))} />
              <FileField label="WebNonMarketed .xls" onFile={(file) => setCatalogFiles((f) => ({ ...f, nonMarketed: file }))} />
              <FileField label="Primary registered .xlsx" onFile={(file) => setCatalogFiles((f) => ({ ...f, primaryRegistered: file }))} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={anyBusy || !serverOk} onClick={runCatalogCheckUpload} className="btn btn-secondary">
                {catStep === "checking" ? "Checking…" : "Preview from these files"}
              </button>
              <button type="button" disabled={anyBusy || !serverOk} onClick={runCatalogCheckFromMoPH} className="btn btn-secondary">
                {catStep === "checking" ? "Downloading…" : "Download from MoPH instead"}
              </button>
            </div>
            {catMessage && catStep !== "done" ? <p className="text-dense text-fg-2">{catMessage}</p> : null}
            {catCheck ? (
              <MophPreview
                check={catCheck}
                mode="catalog"
                applyRetailPrices={applyRetailPrices}
                onApplyRetailPrices={setApplyRetailPrices}
                canApply={catStep === "ready"}
                busy={catBusy}
                applyingLabel="Importing…"
                applyLabel="Import catalogue"
                onApply={runCatalogApply}
              />
            ) : null}
            {catStep === "done" && catMessage ? <Alert tone="success">{catMessage}</Alert> : null}
            {catError ? <Alert tone="error">{catError}</Alert> : null}
          </section>
        </div>
      </ScrollBox>
    </PageShell>
  );
}
