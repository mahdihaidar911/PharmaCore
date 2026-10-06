import { Router } from "express";
import { z } from "zod";
import { db, type SettingsRow } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const settingsSchema = z.object({
  address: z.string().max(500),
  receipt_footer: z.string().max(500),
  exchange_rate: z.number().positive(),
});

router.get("/", requireAuth, (_req, res) => {
  const row = db.prepare("SELECT * FROM pharmacy_settings WHERE id = 1").get() as SettingsRow;
  return res.json({
    ...row,
    name_ar: row.name_ar ?? "",
    pharmacist_name: row.pharmacist_name ?? "",
    license_no: row.license_no ?? "",
    order_reg_no: row.order_reg_no ?? "",
    cnss_no: row.cnss_no ?? "",
    location: row.location ?? row.address ?? "",
    vat_no: row.vat_no ?? "",
  });
});

router.put("/", requireAuth, (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { address, receipt_footer, exchange_rate } = parsed.data;

  db.prepare(`
    UPDATE pharmacy_settings
    SET address = ?, receipt_footer = ?, exchange_rate = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(address, receipt_footer, exchange_rate);

  const settings = db.prepare("SELECT * FROM pharmacy_settings WHERE id = 1").get() as SettingsRow;
  return res.json({
    ...settings,
    name_ar: settings.name_ar ?? "",
    pharmacist_name: settings.pharmacist_name ?? "",
    license_no: settings.license_no ?? "",
    order_reg_no: settings.order_reg_no ?? "",
    cnss_no: settings.cnss_no ?? "",
    location: settings.location ?? settings.address ?? "",
    vat_no: settings.vat_no ?? "",
  });
});

export default router;
