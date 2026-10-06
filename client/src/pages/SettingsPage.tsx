import { FormEvent, useEffect, useState } from "react";
import { api, type PharmacySettings } from "../lib/api";
import { PageShell, ScrollBox } from "../components/PageShell";
import { useSettings } from "../context/SettingsContext";

export default function SettingsPage() {
  const { refreshSettings } = useSettings();
  const [form, setForm] = useState({
    address: "",
    receipt_footer: "",
    exchange_rate: "",
  });
  const [updatedAt, setUpdatedAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      const settings = await api.updateSettings({
        address: form.address.trim(),
        receipt_footer: form.receipt_footer.trim(),
        exchange_rate: Number(form.exchange_rate),
      });
      setUpdatedAt(settings.updated_at);
      await refreshSettings();
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
  }

  return (
    <PageShell
      title="Settings"
      description="Exchange rate, receipt footer, and system options. Pharmacy name and licence details are under Profile."
    >
      <ScrollBox className="mx-auto min-h-0 w-full max-w-2xl flex-1">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 pb-6">
          <p className="text-sm text-slate-600">
            Receipt header (pharmacy name, pharmacist, licences) →{" "}
            <a href="/profile" className="font-medium text-teal-700 underline">
              Pharmacy profile
            </a>
          </p>

          <Field
            label="Address (internal)"
            value={form.address}
            onChange={(value) => setForm({ ...form, address: value })}
          />
          <Field
            label="Receipt footer"
            value={form.receipt_footer}
            onChange={(value) => setForm({ ...form, receipt_footer: value })}
          />
          <Field
            label="Exchange rate (LBP per 1 USD)"
            value={form.exchange_rate}
            onChange={(value) => setForm({ ...form, exchange_rate: value })}
            type="number"
          />

          {updatedAt ? <p className="text-xs text-slate-400">Last updated: {updatedAt}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-teal-700">{message}</p> : null}

          <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
            Save settings
          </button>
        </form>
      </ScrollBox>
    </PageShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type={type}
        step={type === "number" ? "1" : undefined}
        min={type === "number" ? "1" : undefined}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
