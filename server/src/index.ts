import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDatabase } from "./db/index.js";
import authRoutes from "./routes/auth.js";
import backupRoutes from "./routes/backup.js";
import checkoutRoutes, { checkoutHandler } from "./routes/checkout.js";
import inventoryRoutes from "./routes/inventory.js";
import posRoutes from "./routes/pos.js";
import productRoutes from "./routes/products.js";
import reportsRoutes from "./routes/reports.js";
import returnsRoutes from "./routes/returns.js";
import salesRoutes from "./routes/sales.js";
import settingsRoutes from "./routes/settings.js";
import profileRoutes from "./routes/profile.js";
import mophRoutes from "./routes/moph.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);

initializeDatabase();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    name: "PharmaCore API",
    version: "pilot-1",
    features: { posSearch: true, checkout: true, mophImport: true },
  });
});

app.use("/api/checkout", checkoutRoutes);
app.use("/api/auth", authRoutes);
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

const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) {
      next();
    }
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => {
  console.log(`PharmaCore API running at http://localhost:${PORT}`);
  console.log("  MoPH: POST /api/moph/check  POST /api/moph/apply");
});
