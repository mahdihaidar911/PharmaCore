import { useEffect, useState } from "react";
import { PageShell, Panel, ScrollBox } from "../components/PageShell";
import { Alert, ConfirmDialog, EmptyState } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, type BackupFile } from "../lib/api";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupPage() {
  const { can } = useAuth();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBackups(await api.listBackups());
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load backups"));
  }, []);

  async function createBackup() {
    setError("");
    setMessage("");
    setCreating(true);
    try {
      const result = await api.createBackup();
      setMessage(`Backup created: ${result.filename}`);
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

  return (
    <PageShell
      title="Backup & restore"
      description={
        <>
          Backups are full copies of the database in <code className="text-xs">server/data/backups/</code>. Copy them to a USB drive or another
          computer regularly — a backup on the same disk does not protect against disk failure.
        </>
      }
      actions={
        <button type="button" onClick={createBackup} disabled={creating} className="btn btn-primary">
          {creating ? "Creating…" : "Create backup now"}
        </button>
      }
    >
      <div className="flex h-full min-h-0 w-full max-w-3xl flex-col gap-3 overflow-hidden">
        {message ? <Alert tone="success">{message}</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Panel padding={false} className="min-h-0 flex-1">
          <ScrollBox className="h-full min-h-0">
            {backups.map((backup) => (
              <div key={backup.filename} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{backup.filename}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(backup.created_at).toLocaleString()} · {formatSize(backup.size_bytes)}
                  </p>
                </div>
                {can("backup.restore") ? (
                  <button type="button" onClick={() => setRestoring(backup.filename)} className="btn btn-secondary btn-sm">
                    Restore
                  </button>
                ) : null}
              </div>
            ))}
            {backups.length === 0 ? <EmptyState title="No backups yet" description="Create one now, then copy it somewhere safe." /> : null}
          </ScrollBox>
        </Panel>
      </div>

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
