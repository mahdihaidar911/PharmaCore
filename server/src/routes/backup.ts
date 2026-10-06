import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { logAudit } from "../services/audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../data");
const backupsDir = path.join(dataDir, "backups");

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const router = Router();

router.get("/", requireAuth, (_req, res) => {
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith(".db"))
    .map((filename) => {
      const fullPath = path.join(backupsDir, filename);
      const stat = fs.statSync(fullPath);
      return {
        filename,
        size_bytes: stat.size,
        created_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return res.json(files);
});

router.post("/create", requireAuth, async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `pharmacore-${timestamp}.db`;
  const destPath = path.join(backupsDir, filename);

  try {
    await db.backup(destPath);
    logAudit({
      userId: req.user?.userId,
      action: "backup.created",
      entityType: "backup",
      details: { filename },
    });
    return res.status(201).json({ filename, path: destPath });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Backup failed",
    });
  }
});

router.post("/restore", requireAuth, (req, res) => {
  const { filename } = req.body as { filename?: string };
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json({ error: "Invalid backup filename" });
  }

  const backupPath = path.join(backupsDir, filename);
  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: "Backup file not found" });
  }

  const dbPath = path.join(dataDir, "pharmacore.db");

  try {
    db.close();
    fs.copyFileSync(backupPath, dbPath);
    logAudit({
      userId: req.user?.userId,
      action: "backup.restored",
      entityType: "backup",
      details: { filename },
    });
    return res.json({
      message: "Database restored. Please restart the PharmaCore server.",
      restarted_required: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Restore failed",
    });
  }
});

export default router;
