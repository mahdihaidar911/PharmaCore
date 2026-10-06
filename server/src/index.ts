import { createApp } from "./app.js";
import { config, isAiConfigured } from "./config.js";
import { readBackupSettings, startBackupScheduler } from "./services/backup.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`PharmaCore API running at http://localhost:${config.port}`);
  console.log(`  AI assistant: ${isAiConfigured() ? `enabled (${config.ai.model})` : "not configured (set AI_MODEL / AI_API_KEY)"}`);
  const backup = readBackupSettings();
  console.log(
    `  Automatic backups: ${backup.auto_enabled ? `daily, keep ${backup.keep_auto}` : "off"}${backup.copy_dir ? `, copied to ${backup.copy_dir}` : ""}`,
  );
  if (!process.env.JWT_SECRET) {
    console.warn("  WARNING: JWT_SECRET is not set; using the development secret.");
  }
  startBackupScheduler();
});
