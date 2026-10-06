import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { ROLES } from "../auth/permissions.js";
import { db, type UserRow } from "../db/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { passwordSchema } from "./auth.js";

const router = Router();
router.use(requireAuth, requirePermission("users.manage"));

const roleSchema = z.enum(ROLES);

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may contain letters, numbers, dot, dash and underscore only"),
  full_name: z.string().trim().max(100).default(""),
  role: roleSchema,
  password: passwordSchema,
});

const updateUserSchema = z.object({
  full_name: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  is_active: z.boolean().optional(),
});

function toListItem(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name ?? "",
    role: user.role,
    is_active: Boolean(user.is_active),
    last_login_at: user.last_login_at,
    created_at: user.created_at,
  };
}

function activeOwnerCount(excludingUserId?: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND is_active = 1 AND id != ?")
    .get(excludingUserId ?? -1) as { n: number };
  return row.n;
}

router.get("/", (_req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY is_active DESC, username ASC").all() as UserRow[];
  return res.json(users.map(toListItem));
});

router.post("/", (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  const { username, full_name, role, password } = parsed.data;

  const clash = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (clash) {
    return res.status(409).json({ error: `Username "${username}" is already taken` });
  }

  const result = db
    .prepare("INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)")
    .run(username, bcrypt.hashSync(password, 10), role, full_name);
  const id = Number(result.lastInsertRowid);

  logAudit({ userId: req.user!.userId, action: "user.created", entityType: "user", entityId: id, details: { username, role } });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
  return res.status(201).json(toListItem(user));
});

router.put("/:id", (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!existing) {
    return res.status(404).json({ error: "User not found" });
  }

  const next = {
    full_name: parsed.data.full_name ?? existing.full_name ?? "",
    role: parsed.data.role ?? existing.role,
    is_active: parsed.data.is_active ?? Boolean(existing.is_active),
  };

  if (id === req.user!.userId && !next.is_active) {
    return res.status(400).json({ error: "You cannot disable your own account" });
  }
  const losesOwner = existing.role === "owner" && existing.is_active && (next.role !== "owner" || !next.is_active);
  if (losesOwner && activeOwnerCount(id) === 0) {
    return res.status(400).json({ error: "The pharmacy must keep at least one active owner account" });
  }

  db.prepare("UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?").run(
    next.full_name,
    next.role,
    next.is_active ? 1 : 0,
    id,
  );

  logAudit({
    userId: req.user!.userId,
    action: "user.updated",
    entityType: "user",
    entityId: id,
    details: { before: { role: existing.role, is_active: Boolean(existing.is_active) }, after: next },
  });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
  return res.json(toListItem(user));
});

router.post("/:id/reset-password", (req, res) => {
  const parsed = z.object({ password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  const id = Number(req.params.id);
  const result = db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(bcrypt.hashSync(parsed.data.password, 10), id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  logAudit({ userId: req.user!.userId, action: "user.password_reset", entityType: "user", entityId: id });
  return res.json({ ok: true });
});

export default router;
