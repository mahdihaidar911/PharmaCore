import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.join(__dirname, "..");
const repoRoot = path.join(serverRoot, "..");

for (const envFile of [path.join(serverRoot, ".env"), path.join(repoRoot, ".env")]) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Missing .env files are fine; real environment variables still apply.
  }
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const DEV_JWT_SECRET = "pharmacore-dev-secret-change-in-production";
const jwtSecret = process.env.JWT_SECRET || DEV_JWT_SECRET;
if (isProduction && jwtSecret === DEV_JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production. See .env.example.");
}

const dataDir = process.env.PHARMACORE_DATA_DIR
  ? path.resolve(process.env.PHARMACORE_DATA_DIR)
  : path.join(serverRoot, "data");

export const config = {
  isProduction,
  isTest,
  port: numberEnv("PORT", 4000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  dataDir,
  /** ":memory:" is used by the automated test suite. */
  dbPath: process.env.PHARMACORE_DB_PATH || path.join(dataDir, "pharmacore.db"),
  backupsDir: path.join(dataDir, "backups"),
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || "admin123",
  ai: {
    /** Any OpenAI-compatible Chat Completions endpoint (OpenAI, Azure-compatible gateways, Ollama, LM Studio). */
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "",
    timeoutMs: numberEnv("AI_TIMEOUT_MS", 45_000),
    maxToolRounds: numberEnv("AI_MAX_TOOL_ROUNDS", 5),
    requestsPerWindow: numberEnv("AI_RATE_LIMIT", 30),
    rateWindowMs: numberEnv("AI_RATE_WINDOW_MS", 5 * 60_000),
  },
};

export function isAiConfigured(): boolean {
  const local = /localhost|127\.0\.0\.1/.test(config.ai.baseUrl);
  return Boolean(config.ai.model) && (Boolean(config.ai.apiKey) || local);
}
