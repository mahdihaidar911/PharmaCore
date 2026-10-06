import Database from "better-sqlite3";
import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { db, dbPath } from "../db/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import {
  backupsDir,
  checkCopyDir,
  createBackup,
  getBackupStatus,
  isSafeBackupName,
  listBackupFiles,
  readBackupSettings,
} from "../services/backup.js";

const router = Router();

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
  return res.json(listBackupFiles());
});

router.get("/status", requireAuth, requirePermission("backup.create"), (_req, res) => {
  return res.json(getBackupStatus());
});

const settingsSchema = z.object({
  auto_enabled: z.boolean(),
  keep_auto: z.number().int().min(3).max(365),
  copy_dir: z.string().trim().max(400),
});

router.put("/settings", requireAuth, requirePermission("settings.manage"), (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { auto_enabled, keep_auto, copy_dir } = parsed.data;
  if (copy_dir) {
    const problem = checkCopyDir(copy_dir);
    if (problem) return res.status(400).json({ error: problem });
  }
  db.prepare(
    "UPDATE pharmacy_settings SET backup_auto_enabled = ?, backup_keep_auto = ?, backup_copy_dir = ? WHERE id = 1",
  ).run(auto_enabled ? 1 : 0, keep_auto, copy_dir);
  logAudit({ userId: req.user?.userId, action: "backup.settings_updated", entityType: "settings", details: parsed.data });
  return res.json(readBackupSettings());
});

router.post("/create", requireAuth, requirePermission("backup.create"), async (req, res) => {
  try {
    const result = await createBackup("manual");
    logAudit({ userId: req.user?.userId, action: "backup.created", entityType: "backup", details: { filename: result.filename } });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Backup failed" });
  }
});

router.post("/restore", requireAuth, requirePermission("backup.restore"), async (req, res) => {
  const { filename } = (req.body ?? {}) as { filename?: unknown };
  if (!isSafeBackupName(filename)) {
    return res.status(400).json({ error: "Invalid backup filename" });
  }

  const backupPath = path.join(backupsDir(), filename);
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

  try {
    const safety = await createBackup("pre-restore");
    logAudit({
      userId: req.user?.userId,
      action: "backup.restored",
      entityType: "backup",
      details: { filename, safety_backup: safety.filename },
    });

    db.close();
    for (const suffix of ["-wal", "-shm"]) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
    fs.copyFileSync(backupPath, dbPath);

    return res.json({
      message: `Database restored from ${filename}. A safety copy of the previous data was saved as ${safety.filename}. Restart the PharmaCore server now.`,
      restarted_required: true,
      safety_backup: safety.filename,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Restore failed" });
  }
});

export default router;
