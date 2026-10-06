import { FormEvent, useEffect, useState } from "react";
import { api, type PharmacyProfile } from "../lib/api";
import { PageShell, ScrollBox } from "../components/PageShell";
import { useSettings } from "../context/SettingsContext";

const emptyProfile: PharmacyProfile = {
  name: "",
  name_ar: "",
  pharmacist_name: "",
  license_no: "",
  order_reg_no: "",
  cnss_no: "",
  location: "",
  phone: "",
  vat_no: "",
};

export default function ProfilePage() {
  const { refreshSettings } = useSettings();
  const [form, setForm] = useState<PharmacyProfile>(emptyProfile);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getProfile()
      .then(setForm)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile"));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      await api.updateProfile({
        name: form.name.trim(),
        name_ar: form.name_ar.trim(),
        pharmacist_name: form.pharmacist_name.trim(),
        license_no: form.license_no.trim(),
        order_reg_no: form.order_reg_no.trim(),
        cnss_no: form.cnss_no.trim(),
        location: form.location.trim(),
        phone: form.phone.trim(),
        vat_no: form.vat_no.trim(),
      });
      await refreshSettings();
      setMessage("Pharmacy profile saved. Receipts will use these details.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    }
  }

  return (
    <PageShell
      title="Pharmacy profile"
      description="Official pharmacy details printed on every receipt (English left, Arabic right)."
    >
      <ScrollBox className="mx-auto min-h-0 w-full max-w-2xl flex-1">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 pb-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Pharmacy name</h3>
            <Field
              label="English (receipt header left)"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              required
            />
            <Field
              label="Arabic (receipt header right)"
              value={form.name_ar}
              onChange={(v) => setForm({ ...form, name_ar: v })}
              dir="rtl"
            />
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Receipt details</h3>
            <p className="text-xs text-slate-500">Each line prints as one row — English on the left, Arabic on the right.</p>
            <Field
              label="Pharmacist"
              value={form.pharmacist_name}
              onChange={(v) => setForm({ ...form, pharmacist_name: v })}
            />
            <Field label="Licence No" value={form.license_no} onChange={(v) => setForm({ ...form, license_no: v })} />
            <Field
              label="Order Reg. No"
              value={form.order_reg_no}
              onChange={(v) => setForm({ ...form, order_reg_no: v })}
            />
            <Field label="CNSS No" value={form.cnss_no} onChange={(v) => setForm({ ...form, cnss_no: v })} />
            <Field label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
            <Field label="Tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="VAT #" value={form.vat_no} onChange={(v) => setForm({ ...form, vat_no: v })} />
          </section>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-teal-700">{message}</p> : null}

          <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
            Save profile
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
  required = false,
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  dir?: "rtl";
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type="text"
        required={required}
        dir={dir}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
