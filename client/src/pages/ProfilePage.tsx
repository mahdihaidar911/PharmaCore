import { FormEvent, useEffect, useState } from "react";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { Alert } from "../components/ui";
import { useSettings } from "../context/SettingsContext";
import { api, type PharmacyProfile } from "../lib/api";

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
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof PharmacyProfile) => (v: string) => setForm({ ...form, [key]: v });

  return (
    <PageShell title="Pharmacy profile" description="Official details printed on every receipt — English on the left, Arabic on the right.">
      <ScrollBox className="min-h-0 flex-1">
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-5 pb-4">
          <section className="sheet px-4 pt-3 pb-4">
            <SectionHead title="Pharmacy name" />
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <TextField label="English (receipt header, left)" value={form.name} onChange={set("name")} required />
              <TextField label="Arabic (receipt header, right)" value={form.name_ar} onChange={set("name_ar")} dir="rtl" />
            </div>
          </section>

          <section className="sheet px-4 pt-3 pb-4">
            <SectionHead title="Receipt details" />
            <p className="meta mt-1 mb-2">Each field prints as one line on the receipt.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Pharmacist" value={form.pharmacist_name} onChange={set("pharmacist_name")} />
              <TextField label="Licence No" value={form.license_no} onChange={set("license_no")} mono />
              <TextField label="Order Reg. No" value={form.order_reg_no} onChange={set("order_reg_no")} mono />
              <TextField label="CNSS No" value={form.cnss_no} onChange={set("cnss_no")} mono />
              <TextField label="VAT #" value={form.vat_no} onChange={set("vat_no")} mono />
              <TextField label="Tel" value={form.phone} onChange={set("phone")} mono />
              <div className="sm:col-span-2">
                <TextField label="Location" value={form.location} onChange={set("location")} />
              </div>
            </div>
          </section>

          {error ? <Alert tone="error">{error}</Alert> : null}
          {message ? <Alert tone="success">{message}</Alert> : null}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      </ScrollBox>
    </PageShell>
  );
}

function TextField({
  label,
  value,
  onChange,
  required = false,
  dir,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  dir?: "rtl";
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input type="text" required={required} dir={dir} className={`input ${mono ? "font-mono" : ""}`} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
