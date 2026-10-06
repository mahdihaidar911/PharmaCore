import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const router = Router();

router.post("/login", (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as
      | { id: number; username: string; password_hash: string }
      | undefined;

    if (!user?.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, username: user.username });
    return res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login failed. Restart the server with npm run dev." });
  }
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
