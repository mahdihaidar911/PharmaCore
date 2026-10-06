import { createApp } from "./app.js";
import { config, isAiConfigured } from "./config.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`PharmaCore API running at http://localhost:${config.port}`);
  console.log(`  AI assistant: ${isAiConfigured() ? `enabled (${config.ai.model})` : "not configured (set AI_MODEL / AI_API_KEY)"}`);
  if (!process.env.JWT_SECRET) {
    console.warn("  WARNING: JWT_SECRET is not set; using the development secret.");
  }
});
