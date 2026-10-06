import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { analyzeBusiness } from "../ai/insights.js";
import { SearchIntentError, naturalLanguageSearch } from "../ai/nlSearch.js";
import { AiUnavailableError, runAssistantChat, type AiUser } from "../ai/orchestrator.js";
import { AiProviderError, getProvider } from "../ai/provider.js";
import { AI_TOOLS } from "../ai/tools.js";
import { hasPermission } from "../auth/permissions.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { isoDateSchema } from "../services/dates.js";
import { BusinessError } from "../services/errors.js";
import { createRateLimiter } from "../services/rateLimit.js";

const router = Router();
router.use(requireAuth, requirePermission("ai.use"));

const limiter = createRateLimiter({ max: config.ai.requestsPerWindow, windowMs: config.ai.rateWindowMs });

function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (!limiter.hit(String(req.user!.userId))) {
    return res.status(429).json({ error: "Too many assistant requests. Please wait a few minutes." });
  }
  next();
}

const aiUser = (req: Request): AiUser => ({ userId: req.user!.userId, username: req.user!.username, role: req.user!.role });

function sendAiError(res: Response, error: unknown) {
  if (error instanceof AiUnavailableError) {
    return res.status(503).json({ error: error.message, configured: false });
  }
  if (error instanceof AiProviderError) {
    return res.status(502).json({ error: error.message });
  }
  if (error instanceof SearchIntentError || error instanceof BusinessError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof RangeError) {
    return res.status(400).json({ error: error.message });
  }
  throw error;
}

router.get("/status", (req, res) => {
  const provider = getProvider();
  let host: string | null = null;
  try {
    host = provider ? new URL(config.ai.baseUrl).host : null;
  } catch {
    host = null;
  }
  return res.json({
    configured: Boolean(provider),
    model: provider?.model ?? null,
    host,
    tools: AI_TOOLS.map((t) => ({ name: t.name, description: t.description, allowed: hasPermission(req.user!.role, t.permission) })),
  });
});

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(20)
    .refine((m) => m[m.length - 1].role === "user", "The last message must be from the user")
    .refine((m) => m[m.length - 1].content.length <= 1000, "Questions are limited to 1000 characters"),
});

router.post("/chat", rateLimit, async (req, res, next) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  try {
    return res.json(await runAssistantChat(aiUser(req), parsed.data.messages.slice(-12)));
  } catch (error) {
    try {
      return sendAiError(res, error);
    } catch (unhandled) {
      return next(unhandled);
    }
  }
});

const analyzeSchema = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() });

router.post("/analyze", rateLimit, async (req, res, next) => {
  const parsed = analyzeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  try {
    return res.json(await analyzeBusiness(aiUser(req), parsed.data.from, parsed.data.to));
  } catch (error) {
    try {
      return sendAiError(res, error);
    } catch (unhandled) {
      return next(unhandled);
    }
  }
});

const searchSchema = z.object({ query: z.string().trim().min(3, "Describe what you are looking for").max(300) });

router.post("/search", rateLimit, async (req, res, next) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  try {
    return res.json(await naturalLanguageSearch(aiUser(req), parsed.data.query));
  } catch (error) {
    try {
      return sendAiError(res, error);
    } catch (unhandled) {
      return next(unhandled);
    }
  }
});

router.get("/logs", requirePermission("ai.logs"), (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const rows = db
    .prepare(`
      SELECT l.id, l.kind, l.prompt, l.response, l.tool_calls, l.model, l.status, l.error, l.latency_ms, l.created_at,
             u.username
      FROM ai_logs l LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.id DESC LIMIT ?
    `)
    .all(limit) as { tool_calls: string | null }[];
  return res.json(rows.map((r) => ({ ...r, tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : [] })));
});

export default router;
