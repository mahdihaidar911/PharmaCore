/**
 * Free port 4000 before starting the API (Windows stale process fix).
 */
import { execSync } from "node:child_process";
import os from "node:os";

const port = process.argv[2] ?? "4000";

if (os.platform() === "win32") {
  try {
    const lines = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" }).trim().split("\n");
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`Freed port ${port} (stopped PID ${pid})`);
      } catch {
        // ignore
      }
    }
  } catch {
    // port not in use
  }
} else {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: "ignore", shell: true });
  } catch {
    // ignore
  }
}
