import { FormEvent, useEffect, useState } from "react";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { Alert, Badge, ConfirmDialog, EmptyState, Field, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, type BackupFile, type BackupStatus } from "../lib/api";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAge(hours: number | null) {
  if (hours === null) return "never";
  if (hours < 1) return "less than an hour ago";
  if (hours < 48) return `${Math.floor(hours)} hour(s) ago`;
  return `${Math.floor(hours / 24)} day(s) ago`;
}

const KIND_LABEL: Record<BackupFile["kind"], { label: string; tone: "neutral" | "brand" | "warning" }> = {
  manual: { label: "Manual", tone: "neutral" },
  auto: { label: "Automatic", tone: "brand" },
  "pre-restore": { label: "Before restore", tone: "warning" },
};

export default function BackupPage() {
  const { can } = useAuth();
  const canConfigure = can("settings.manage");
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ auto_enabled: true, keep_auto: "14", copy_dir: "" });
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");

  async function load() {
    const [list, st] = await Promise.all([api.listBackups(), api.getBackupStatus()]);
    setBackups(list);
    setStatus(st);
    return st;
  }

  useEffect(() => {
    load()
      .then((st) => setForm({ auto_enabled: st.settings.auto_enabled, keep_auto: String(st.settings.keep_auto), copy_dir: st.settings.copy_dir }))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load backups"));
  }, []);

  async function createBackup() {
    setError("");
    setMessage("");
    setCreating(true);
    try {
      const result = await api.createBackup();
      const copyNote =
        result.copy_status === "copied" ? " and copied to the second location" : result.copy_status === "failed" ? `, but the copy failed: ${result.copy_error}` : "";
      setMessage(`Backup created: ${result.filename}${copyNote}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setCreating(false);
    }
  }

  async function restore() {
    if (!restoring) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.restoreBackup(restoring);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
      setRestoring(null);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSettingsError("");
    setSettingsMessage("");
    try {
      await api.updateBackupSettings({ auto_enabled: form.auto_enabled, keep_auto: Number(form.keep_auto), copy_dir: form.copy_dir.trim() });
      setSettingsMessage(form.copy_dir.trim() ? "Saved. The folder is reachable; new backups will be copied there." : "Saved.");
      await load();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not save backup settings");
    }
  }

  const keepInvalid = !Number.isInteger(Number(form.keep_auto)) || Number(form.keep_auto) < 3 || Number(form.keep_auto) > 365;

  return (
    <PageShell
      title="Backup & restore"
      description="A backup is a full copy of the database. Keep at least one copy off this computer — a backup on the same disk does not survive a disk failure or theft."
      actions={
        <button type="button" onClick={createBackup} disabled={creating} className="btn btn-primary">
          {creating ? "Creating…" : "Back up now"}
        </button>
      }
    >
      <ScrollBox className="min-h-0 flex-1">
        <div className="flex max-w-4xl flex-col gap-5 pb-4">
          {message ? <Alert tone="success">{message}</Alert> : null}
          {error ? <Alert tone="error">{error}</Alert> : null}

          {status ? (
            <section className="sheet space-y-3 px-4 pt-3 pb-4">
              <SectionHead
                title="Protection"
                action={
                  <Status tone={status.warnings.length === 0 ? "ok" : status.stale ? "danger" : "caution"} icon={status.warnings.length === 0 ? "check" : "alert"}>
                    {status.warnings.length === 0 ? "Protected" : status.stale ? "At risk" : "Needs attention"}
                  </Status>
                }
              />
              <p className="text-dense text-fg-2">
                Last backup <strong className="text-fg">{formatAge(status.age_hours)}</strong> · Automatic backups{" "}
                {status.settings.auto_enabled ? `every ${status.interval_hours} h, keeping ${status.settings.keep_auto}` : "off"}
              </p>
              {status.warnings.map((w) => (
                <Alert key={w} tone={status.stale ? "error" : "warning"}>
                  {w}
                </Alert>
              ))}
            </section>
          ) : null}

          {canConfigure ? (
            <form onSubmit={saveSettings} className="sheet space-y-4 px-4 pt-3 pb-4">
              <SectionHead title="Automatic backups" />
              <label className="flex items-center gap-2 text-sm text-fg-2">
                <input type="checkbox" className="h-4 w-4" checked={form.auto_enabled} onChange={(e) => setForm({ ...form, auto_enabled: e.target.checked })} />
                Back up automatically once a day while PharmaCore is running
              </label>
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <Field label="Keep automatic" error={keepInvalid ? "3 to 365" : null} hint="Older automatic backups are deleted.">
                  <input type="number" min={3} max={365} className="input" value={form.keep_auto} onChange={(e) => setForm({ ...form, keep_auto: e.target.value })} />
                </Field>
                <Field label="Second location (optional)" hint="Full path to a USB stick, external drive or network folder, e.g. E:\PharmaCoreBackups. Every backup is copied there.">
                  <input className="input font-mono text-sm" value={form.copy_dir} onChange={(e) => setForm({ ...form, copy_dir: e.target.value })} placeholder="E:\PharmaCoreBackups" />
                </Field>
              </div>
              {settingsError ? <Alert tone="error">{settingsError}</Alert> : null}
              {settingsMessage ? <Alert tone="success">{settingsMessage}</Alert> : null}
              <button type="submit" className="btn btn-secondary" disabled={keepInvalid}>
                Save backup settings
              </button>
            </form>
          ) : null}

          <section className="sheet px-4 pt-3 pb-2">
            <SectionHead title="Backups on this computer" count={backups.length} />
            {backups.length === 0 ? (
              <EmptyState title="No backups yet" description="Create one now, then copy it somewhere safe." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Kind</th>
                    <th className="hidden sm:table-cell">Created</th>
                    <th className="num hidden md:table-cell">Size</th>
                    {can("backup.restore") ? <th className="w-px" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.filename}>
                      <td className="w-full max-w-0">
                        <p className="code truncate text-fg">{backup.filename}</p>
                        <p className="meta sm:hidden">{new Date(backup.created_at).toLocaleString()}</p>
                      </td>
                      <td>
                        <Badge tone={KIND_LABEL[backup.kind].tone}>{KIND_LABEL[backup.kind].label}</Badge>
                      </td>
                      <td className="hidden whitespace-nowrap font-mono text-dense text-fg-2 sm:table-cell">{new Date(backup.created_at).toLocaleString()}</td>
                      <td className="num hidden whitespace-nowrap md:table-cell">{formatSize(backup.size_bytes)}</td>
                      {can("backup.restore") ? (
                        <td>
                          <button type="button" onClick={() => setRestoring(backup.filename)} className="btn btn-secondary btn-sm">
                            Restore
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </ScrollBox>

      <ConfirmDialog
        open={Boolean(restoring)}
        title="Restore this backup?"
        destructive
        busy={busy}
        confirmLabel="Restore and replace data"
        message={
          <div className="space-y-2">
            <p>
              All current data will be replaced with <strong>{restoring}</strong>. Sales and stock changes made after that backup will no longer
              appear.
            </p>
            <p>A safety copy of the current data is saved automatically first. The server must be restarted after the restore.</p>
          </div>
        }
        onConfirm={restore}
        onCancel={() => setRestoring(null)}
      />
    </PageShell>
  );
}
