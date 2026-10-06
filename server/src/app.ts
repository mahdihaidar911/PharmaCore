import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { config, serverRoot } from "./config.js";
import { db, initializeDatabase } from "./db/index.js";
import aiRoutes from "./routes/ai.js";
import authRoutes from "./routes/auth.js";
import backupRoutes from "./routes/backup.js";
import checkoutRoutes from "./routes/checkout.js";
import inventoryRoutes from "./routes/inventory.js";
import mophRoutes from "./routes/moph.js";
import posRoutes from "./routes/pos.js";
import productRoutes from "./routes/products.js";
import profileRoutes from "./routes/profile.js";
import reportsRoutes from "./routes/reports.js";
import returnsRoutes from "./routes/returns.js";
import salesRoutes from "./routes/sales.js";
import settingsRoutes from "./routes/settings.js";
import userRoutes from "./routes/users.js";

export function createApp() {
  initializeDatabase();

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.isProduction ? false : true, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: db.open ? "ok" : "restart_required",
      name: "PharmaCore API",
      version: "pilot-2",
      features: { posSearch: true, checkout: true, mophImport: true, roles: true, ai: true },
    });
  });

  // After a backup restore the connection is closed until the server restarts.
  app.use("/api", (_req, res, next) => {
    if (!db.open) {
      return res.status(503).json({ error: "The database was restored. Restart the PharmaCore server to continue." });
    }
    next();
  });

  app.use("/api/checkout", checkoutRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/pos", posRoutes);
  app.use("/api/sales", salesRoutes);
  app.use("/api/returns", returnsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/backup", backupRoutes);
  app.use("/api/moph", mophRoutes);
  app.use("/api/ai", aiRoutes);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const clientDist = path.join(serverRoot, "../client/dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number; type?: string })?.status;
    if (status === 400 || status === 413) {
      return res.status(status).json({ error: status === 413 ? "Request too large" : "Malformed request body" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  });

  return app;
}
