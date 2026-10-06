import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { db, type SettingsRow } from "../db/index.js";

export type BackupKind = "manual" | "auto" | "pre-restore";

export const AUTO_BACKUP_INTERVAL_HOURS = 24;
/** Dashboard warns when the newest successful backup is older than this. */
export const STALE_BACKUP_HOURS = 48;

const PREFIX: Record<BackupKind, string> = { manual: "pharmacore", auto: "auto", "pre-restore": "pre-restore" };

export function backupsDir() {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  return config.backupsDir;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function kindFromFilename(filename: string): BackupKind {
  if (filename.startsWith("auto-")) return "auto";
  if (filename.startsWith("pre-restore-")) return "pre-restore";
  return "manual";
}

export function isSafeBackupName(filename: unknown): filename is string {
  return typeof filename === "string" && /^[\w.-]+\.db$/.test(filename) && !filename.includes("..");
}

export function readBackupSettings() {
  const row = db
    .prepare("SELECT backup_auto_enabled, backup_keep_auto, backup_copy_dir FROM pharmacy_settings WHERE id = 1")
    .get() as Pick<SettingsRow, "backup_auto_enabled" | "backup_keep_auto" | "backup_copy_dir">;
  return {
    auto_enabled: Boolean(row.backup_auto_enabled),
    keep_auto: row.backup_keep_auto,
    copy_dir: row.backup_copy_dir ?? "",
  };
}

/** Returns an error message, or null when the folder can receive backup copies. */
export function checkCopyDir(dir: string): string | null {
  if (!path.isAbsolute(dir)) return "Use a full folder path, e.g. E:\\PharmaCoreBackups";
  if (path.resolve(dir).startsWith(path.resolve(config.dataDir))) {
    return "Choose a folder outside the PharmaCore data folder (ideally another drive or a USB stick).";
  }
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return "Folder not found. Is the drive connected?";
    const probe = path.join(dir, `.pharmacore-write-test-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    return null;
  } catch (error) {
    return `Cannot write to this folder: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function pruneAutoBackups(dir: string, keep: number) {
  const autos = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("auto-") && f.endsWith(".db"))
    .sort()
    .reverse();
  for (const file of autos.slice(keep)) fs.rmSync(path.join(dir, file), { force: true });
}

export type BackupResult = {
  filename: string;
  path: string;
  size_bytes: number;
  copy_status: "copied" | "failed" | "skipped";
  copy_error: string | null;
};

/** Online SQLite backup (safe while the app is in use), plus an optional copy to a second location. */
export async function createBackup(kind: BackupKind): Promise<BackupResult> {
  const dir = backupsDir();
  const filename = `${PREFIX[kind]}-${timestamp()}.db`;
  const dest = path.join(dir, filename);
  const settings = readBackupSettings();

  try {
    await db.backup(dest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare("INSERT INTO backup_runs (kind, filename, status, error) VALUES (?, ?, 'failed', ?)").run(kind, filename, message);
    throw new Error(`Backup failed: ${message}`);
  }

  const size = fs.statSync(dest).size;
  let copyStatus: BackupResult["copy_status"] = "skipped";
  let copyError: string | null = null;
  if (settings.copy_dir) {
    copyError = checkCopyDir(settings.copy_dir);
    if (!copyError) {
      try {
        fs.copyFileSync(dest, path.join(settings.copy_dir, filename));
        if (kind === "auto") pruneAutoBackups(settings.copy_dir, settings.keep_auto);
      } catch (error) {
        copyError = error instanceof Error ? error.message : String(error);
      }
    }
    copyStatus = copyError ? "failed" : "copied";
  }

  if (kind === "auto") pruneAutoBackups(dir, settings.keep_auto);

  db.prepare(
    "INSERT INTO backup_runs (kind, filename, status, copy_status, copy_error, size_bytes) VALUES (?, ?, 'ok', ?, ?, ?)",
  ).run(kind, filename, copyStatus, copyError, size);

  return { filename, path: dest, size_bytes: size, copy_status: copyStatus, copy_error: copyError };
}

export function listBackupFiles() {
  const dir = backupsDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((filename) => {
      const stat = fs.statSync(path.join(dir, filename));
      return { filename, kind: kindFromFilename(filename), size_bytes: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Newest backup we can trust: files on disk count too, so backups made before run tracking existed are seen. */
function lastSuccessfulBackupAt(): Date | null {
  const newestFile = listBackupFiles().find((f) => f.kind !== "pre-restore");
  return newestFile ? new Date(newestFile.created_at) : null;
}

export function getBackupStatus(now = new Date()) {
  const last = lastSuccessfulBackupAt();
  const ageHours = last ? (now.getTime() - last.getTime()) / 3_600_000 : null;
  const lastRun = db.prepare("SELECT * FROM backup_runs ORDER BY id DESC LIMIT 1").get() as
    | { kind: string; status: string; error: string | null; copy_status: string | null; copy_error: string | null; created_at: string }
    | undefined;
  const settings = readBackupSettings();

  const warnings: string[] = [];
  if (ageHours === null) warnings.push("No backup has been made yet.");
  else if (ageHours > STALE_BACKUP_HOURS) warnings.push(`Last backup is ${Math.floor(ageHours / 24)} day(s) old.`);
  if (lastRun?.status === "failed") warnings.push(`Last backup failed: ${lastRun.error}`);
  if (lastRun?.copy_status === "failed") warnings.push(`Backup was not copied to the second location: ${lastRun.copy_error}`);
  if (!settings.copy_dir) warnings.push("Backups are only on this computer. Set a second location (USB or another drive).");

  return {
    last_backup_at: last?.toISOString() ?? null,
    age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    stale: ageHours === null || ageHours > STALE_BACKUP_HOURS,
    last_run: lastRun ?? null,
    settings,
    interval_hours: AUTO_BACKUP_INTERVAL_HOURS,
    warnings,
  };
}

let running = false;

/** Called hourly by the scheduler; creates an automatic backup when the newest one is a day old. */
export async function runScheduledBackupIfDue(now = new Date()): Promise<BackupResult | null> {
  if (running) return null;
  const settings = readBackupSettings();
  if (!settings.auto_enabled) return null;
  const last = lastSuccessfulBackupAt();
  if (last && now.getTime() - last.getTime() < AUTO_BACKUP_INTERVAL_HOURS * 3_600_000) return null;

  running = true;
  try {
    return await createBackup("auto");
  } finally {
    running = false;
  }
}

export function startBackupScheduler() {
  const tick = () => {
    runScheduledBackupIfDue().catch((error) => console.error("Automatic backup failed:", error));
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 60 * 60_000).unref();
}
