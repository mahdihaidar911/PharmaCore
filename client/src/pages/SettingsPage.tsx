import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell, ScrollBox } from "../components/PageShell";
import { Alert, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { api, parseServerDate, type PharmacySettings } from "../lib/api";

export default function SettingsPage() {
  const { refreshSettings } = useSettings();
  const { can } = useAuth();
  const canManage = can("settings.manage");
  const [form, setForm] = useState({ address: "", receipt_footer: "", exchange_rate: "" });
  const [updatedAt, setUpdatedAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((settings: PharmacySettings) => {
        setForm({
          address: settings.address,
          receipt_footer: settings.receipt_footer,
          exchange_rate: String(settings.exchange_rate),
        });
        setUpdatedAt(settings.updated_at);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"));
  }, []);

  const rate = Number(form.exchange_rate);
  const rateInvalid = !Number.isFinite(rate) || rate <= 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (rateInvalid) return;
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const settings = await api.updateSettings({
        address: canManage ? form.address.trim() : form.address,
        receipt_footer: canManage ? form.receipt_footer.trim() : form.receipt_footer,
        exchange_rate: rate,
      });
      setUpdatedAt(settings.updated_at);
      await refreshSettings();
      setMessage("Settings saved. New sales use the updated exchange rate; past sales keep the rate they were made at.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="Settings" description="Exchange rate and receipt options. Pharmacy name and licence details are under Pharmacy profile.">
      <ScrollBox className="min-h-0 w-full max-w-2xl flex-1">
        <form onSubmit={handleSubmit} className="card card-body space-y-4">
          <Field
            label="Exchange rate (LBP per 1 USD)"
            error={form.exchange_rate && rateInvalid ? "Enter a positive number" : null}
            hint="Used for LBP totals and payments at checkout."
          >
            <input
              type="number"
              min={1}
              step={1}
              className={`input text-lg font-semibold ${form.exchange_rate && rateInvalid ? "input-invalid" : ""}`}
              value={form.exchange_rate}
              onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
            />
          </Field>

          <Field label="Address (internal)" hint={canManage ? undefined : "Only the owner can change this."}>
            <input className="input" value={form.address} disabled={!canManage} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Receipt footer" hint={canManage ? undefined : "Only the owner can change this."}>
            <input className="input" value={form.receipt_footer} disabled={!canManage} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} />
          </Field>

          {canManage ? (
            <p className="text-sm text-slate-600">
              Receipt header (pharmacy name, pharmacist, licences):{" "}
              <Link to="/profile" className="font-medium text-brand-700 underline">
                Pharmacy profile
              </Link>
            </p>
          ) : null}

          {updatedAt ? <p className="text-xs text-slate-500">Last updated: {parseServerDate(updatedAt).toLocaleString()}</p> : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
          {message ? <Alert tone="success">{message}</Alert> : null}

          <button type="submit" className="btn btn-primary" disabled={saving || rateInvalid}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      </ScrollBox>
    </PageShell>
  );
}
