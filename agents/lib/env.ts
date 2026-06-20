/**
 * Load the repo-root .env into process.env using Node's native loader
 * (Node >= 20.12 / 21+). Best-effort: agents still run if there's no .env.
 * Existing process.env values are not clobbered.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export function loadEnv(): void {
  const envPath = join(process.cwd(), ".env");
  const loader = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }).loadEnvFile;
  if (existsSync(envPath) && typeof loader === "function") {
    try {
      loader.call(process, envPath);
    } catch {
      /* malformed .env — ignore, rely on real env vars */
    }
  }
}
