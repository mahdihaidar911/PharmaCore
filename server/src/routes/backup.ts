import Database from "better-sqlite3";
import { Router } from "express";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { db, dbPath } from "../db/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";

const backupsDir = config.backupsDir;
fs.mkdirSync(backupsDir, { recursive: true });

const router = Router();

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isSafeBackupName(filename: unknown): filename is string {
  return typeof filename === "string" && /^[\w.-]+\.db$/.test(filename) && !filename.includes("..");
}

/** Opens the file read-only and confirms it is an intact PharmaCore database. */
function validateBackupFile(filePath: string): string | null {
  let candidate: Database.Database | null = null;
  try {
    candidate = new Database(filePath, { readonly: true, fileMustExist: true });
    const integrity = candidate.pragma("quick_check", { simple: true });
    if (integrity !== "ok") return `Backup failed integrity check: ${String(integrity)}`;
    const required = ["users", "products", "stock_batches", "sales", "pharmacy_settings"];
    const tables = new Set(
      (candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
        (t) => t.name,
      ),
    );
    const missing = required.filter((t) => !tables.has(t));
    return missing.length ? `Not a PharmaCore backup (missing: ${missing.join(", ")})` : null;
  } catch (error) {
    return `Backup file cannot be read: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    candidate?.close();
  }
}

router.get("/", requireAuth, requirePermission("backup.create"), (_req, res) => {
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith(".db"))
    .map((filename) => {
      const stat = fs.statSync(path.join(backupsDir, filename));
      return { filename, size_bytes: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return res.json(files);
});

router.post("/create", requireAuth, requirePermission("backup.create"), async (req, res) => {
  const filename = `pharmacore-${timestamp()}.db`;
  const destPath = path.join(backupsDir, filename);

  try {
    await db.backup(destPath);
    logAudit({ userId: req.user?.userId, action: "backup.created", entityType: "backup", details: { filename } });
    return res.status(201).json({ filename, path: destPath });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Backup failed" });
  }
});

router.post("/restore", requireAuth, requirePermission("backup.restore"), async (req, res) => {
  const { filename } = (req.body ?? {}) as { filename?: unknown };
  if (!isSafeBackupName(filename)) {
    return res.status(400).json({ error: "Invalid backup filename" });
  }

  const backupPath = path.join(backupsDir, filename);
  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: "Backup file not found" });
  }
  if (dbPath === ":memory:") {
    return res.status(400).json({ error: "Restore is not available for in-memory databases" });
  }

  const problem = validateBackupFile(backupPath);
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  const safetyName = `pre-restore-${timestamp()}.db`;
  try {
    await db.backup(path.join(backupsDir, safetyName));
    logAudit({
      userId: req.user?.userId,
      action: "backup.restored",
      entityType: "backup",
      details: { filename, safety_backup: safetyName },
    });

    db.close();
    for (const suffix of ["-wal", "-shm"]) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
    fs.copyFileSync(backupPath, dbPath);

    return res.json({
      message: `Database restored from ${filename}. A safety copy of the previous data was saved as ${safetyName}. Restart the PharmaCore server now.`,
      restarted_required: true,
      safety_backup: safetyName,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Restore failed" });
  }
});

export default router;
