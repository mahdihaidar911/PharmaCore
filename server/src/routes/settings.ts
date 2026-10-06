import { Router } from "express";
import { z } from "zod";
import { db, type SettingsRow } from "../db/index.js";
import { can, requireAuth, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";

const router = Router();

const settingsSchema = z.object({
  address: z.string().max(500),
  receipt_footer: z.string().max(500),
  exchange_rate: z.number().positive().max(10_000_000),
});

function readSettings() {
  const { backup_auto_enabled: _auto, backup_keep_auto: _keep, backup_copy_dir: _copy, ...row } = db
    .prepare("SELECT * FROM pharmacy_settings WHERE id = 1")
    .get() as SettingsRow;
  return {
    ...row,
    name_ar: row.name_ar ?? "",
    pharmacist_name: row.pharmacist_name ?? "",
    license_no: row.license_no ?? "",
    order_reg_no: row.order_reg_no ?? "",
    cnss_no: row.cnss_no ?? "",
    location: row.location ?? row.address ?? "",
    vat_no: row.vat_no ?? "",
  };
}

router.get("/", requireAuth, (_req, res) => {
  return res.json(readSettings());
});

router.put("/", requireAuth, requirePermission("settings.manage", "settings.exchange_rate"), (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const current = readSettings();
  const { address, receipt_footer, exchange_rate } = parsed.data;
  const touchesGeneralSettings = address !== current.address || receipt_footer !== current.receipt_footer;
  if (touchesGeneralSettings && !can(req, "settings.manage")) {
    return res.status(403).json({ error: "Only the owner can change the address or receipt footer." });
  }

  db.prepare(`
    UPDATE pharmacy_settings
    SET address = ?, receipt_footer = ?, exchange_rate = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(address, receipt_footer, exchange_rate);

  if (exchange_rate !== current.exchange_rate) {
    logAudit({
      userId: req.user!.userId,
      action: "settings.exchange_rate_changed",
      entityType: "settings",
      entityId: 1,
      details: { from: current.exchange_rate, to: exchange_rate },
    });
  }

  return res.json(readSettings());
});

export default router;
