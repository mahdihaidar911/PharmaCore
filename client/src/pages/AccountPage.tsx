import { FormEvent, useState } from "react";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { Alert, Badge, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export default function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setSuccess("Password changed. Use the new password next time you sign in.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="My account" description="Your sign-in details and password.">
      <ScrollBox className="min-h-0 flex-1">
        <div className="grid max-w-4xl gap-x-10 gap-y-8 pb-2 lg:grid-cols-2">
          <section>
            <SectionHead title="Signed in as" />
            <dl className="mt-1 text-sm">
              <div className="flex justify-between gap-4 border-b border-rule py-2.5">
                <dt className="text-ink-3">Username</dt>
                <dd className="font-mono font-medium">{user?.username}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-rule py-2.5">
                <dt className="text-ink-3">Name</dt>
                <dd className="font-medium">{user?.full_name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-rule py-2.5">
                <dt className="text-ink-3">Role</dt>
                <dd>
                  <Badge tone="brand">{user?.role}</Badge>
                </dd>
              </div>
            </dl>
            <p className="meta mt-3">Only the owner can change names and roles, from the Users page.</p>
          </section>

          <form onSubmit={handleSubmit} className="space-y-4">
            <SectionHead title="Change password" />
            <Field label="Current password">
              <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </Field>
            <Field label="New password" hint="At least 6 characters.">
              <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required />
            </Field>
            <Field label="Confirm new password">
              <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </Field>
            {error ? <Alert tone="error">{error}</Alert> : null}
            {success ? <Alert tone="success">{success}</Alert> : null}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Change password"}
            </button>
          </form>
        </div>
      </ScrollBox>
    </PageShell>
  );
}
