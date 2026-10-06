import { Router } from "express";
import { z } from "zod";
import { db, type SettingsRow } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const profileSchema = z.object({
  name: z.string().min(1).max(200),
  name_ar: z.string().max(200),
  pharmacist_name: z.string().max(200),
  license_no: z.string().max(100),
  order_reg_no: z.string().max(100),
  cnss_no: z.string().max(100),
  location: z.string().max(500),
  phone: z.string().max(50),
  vat_no: z.string().max(100),
});

function toProfile(row: SettingsRow) {
  return {
    name: row.name,
    name_ar: row.name_ar ?? "",
    pharmacist_name: row.pharmacist_name ?? "",
    license_no: row.license_no ?? "",
    order_reg_no: row.order_reg_no ?? "",
    cnss_no: row.cnss_no ?? "",
    location: row.location ?? row.address ?? "",
    phone: row.phone ?? "",
    vat_no: row.vat_no ?? "",
  };
}

router.get("/", requireAuth, (_req, res) => {
  const row = db.prepare("SELECT * FROM pharmacy_settings WHERE id = 1").get() as SettingsRow;
  return res.json(toProfile(row));
});

router.put("/", requireAuth, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const p = parsed.data;
  db.prepare(`
    UPDATE pharmacy_settings
    SET name = ?, name_ar = ?, pharmacist_name = ?, license_no = ?, order_reg_no = ?,
        cnss_no = ?, location = ?, phone = ?, vat_no = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(
    p.name,
    p.name_ar,
    p.pharmacist_name,
    p.license_no,
    p.order_reg_no,
    p.cnss_no,
    p.location,
    p.phone,
    p.vat_no,
  );

  const row = db.prepare("SELECT * FROM pharmacy_settings WHERE id = 1").get() as SettingsRow;
  return res.json(toProfile(row));
});

export default router;
