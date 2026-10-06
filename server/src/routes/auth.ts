import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { isRole, permissionsForRole } from "../auth/permissions.js";
import { db, type UserRow } from "../db/index.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { createRateLimiter } from "../services/rateLimit.js";

const router = Router();

const failedLogins = createRateLimiter({ max: 5, windowMs: 5 * 60_000 });

export const passwordSchema = z.string().min(6, "Password must be at least 6 characters").max(200);

export function publicUser(user: Pick<UserRow, "id" | "username" | "role" | "full_name">) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name ?? "",
    role: user.role,
    permissions: permissionsForRole(user.role),
  };
}

router.post("/login", (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const key = username.trim().toLowerCase();
  if (failedLogins.isBlocked(key)) {
    return res.status(429).json({ error: "Too many failed attempts. Wait 5 minutes and try again." });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username.trim()) as
    | UserRow
    | undefined;

  if (!user?.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    failedLogins.hit(key);
    return res.status(401).json({ error: "Invalid username or password" });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: "This account is disabled. Ask the owner to re-enable it." });
  }
  if (!isRole(user.role)) {
    return res.status(403).json({ error: "This account has no valid role. Ask the owner to fix it." });
  }

  failedLogins.reset(key);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

  const token = signToken({ userId: user.id, username: user.username, role: user.role });
  return res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.userId) as UserRow;
  return res.json({ user: publicUser(user) });
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: passwordSchema,
});

router.post("/change-password", requireAuth, (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.userId) as UserRow;
  if (!bcrypt.compareSync(parsed.data.current_password, user.password_hash)) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(parsed.data.new_password, 10),
    user.id,
  );
  logAudit({ userId: user.id, action: "user.password_changed", entityType: "user", entityId: user.id });
  return res.json({ ok: true });
});

export default router;
