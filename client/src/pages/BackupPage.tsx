import { useEffect, useState } from "react";
import { PageShell, Panel, ScrollBox } from "../components/PageShell";
import { api, type BackupFile } from "../lib/api";

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const list = await api.listBackups();
    setBackups(list);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load backups"));
  }, []);

  async function createBackup() {
    setError("");
    setMessage("");
    try {
      const result = await api.createBackup();
      setMessage(`Backup created: ${result.filename}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    }
  }

  async function restore(filename: string) {
    if (!confirm(`Restore ${filename}? The server must be restarted after restore.`)) return;
    setError("");
    setMessage("");
    try {
      const result = await api.restoreBackup(filename);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <PageShell
      title="Backup & restore"
      description={
        <>
          Backups are stored in <code className="text-xs">data/backups/</code>. Restore requires a server restart.
        </>
      }
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col gap-4 overflow-hidden">
      <button
        type="button"
        onClick={createBackup}
        className="shrink-0 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
      >
        Create backup now
      </button>

      {message ? <p className="text-sm text-teal-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Panel padding={false} className="min-h-0 flex-1">
        <ScrollBox className="h-full min-h-0">
        {backups.map((backup) => (
          <div
            key={backup.filename}
            className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <div>
              <p className="font-medium text-slate-900">{backup.filename}</p>
              <p className="text-xs text-slate-500">
                {new Date(backup.created_at).toLocaleString()} · {formatSize(backup.size_bytes)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => restore(backup.filename)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Restore
            </button>
          </div>
        ))}
        {backups.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No backups yet.</p> : null}
        </ScrollBox>
      </Panel>
      </div>
    </PageShell>
  );
}
