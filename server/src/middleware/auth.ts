import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { hasPermission, type Permission, type Role } from "../auth/permissions.js";
import { config } from "../config.js";
import { db } from "../db/index.js";

export type AuthPayload = {
  userId: number;
  username: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"],
  });
}

const findActiveUser = () =>
  db.prepare("SELECT id, username, role FROM users WHERE id = ? AND is_active = 1");

/**
 * Role is re-read from the database on every request so that deactivating a user
 * or changing their role takes effect immediately, not when their token expires.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let payload: AuthPayload;
  try {
    payload = jwt.verify(header.slice(7), config.jwtSecret) as AuthPayload;
  } catch {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }

  const user = findActiveUser().get(payload.userId) as
    | { id: number; username: string; role: Role }
    | undefined;
  if (!user) {
    return res.status(401).json({ error: "This account is disabled or no longer exists." });
  }

  req.user = { userId: user.id, username: user.username, role: user.role };
  next();
}

/** Use after requireAuth. Passes when the user has at least one of the listed permissions. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (permissions.some((p) => hasPermission(role, p))) {
      return next();
    }
    return res.status(403).json({ error: "You do not have permission to perform this action." });
  };
}

export function can(req: Request, permission: Permission): boolean {
  return hasPermission(req.user?.role, permission);
}
