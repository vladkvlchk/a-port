/**
 * Manual one-shot: send a test iMessage so you can approve the macOS Automation
 * prompt and confirm delivery before wiring the stylist to it.
 *
 *   npx tsx agents/imessage-test.ts "+380XXXXXXXXX" "hello from A-port"
 *   npx tsx agents/imessage-test.ts "you@icloud.com"
 *
 * Recipient falls back to IMESSAGE_TO / STYLIST_PHONE from .env.
 */

import { loadEnv } from "./lib/env";
import { sendIMessage } from "./lib/imessage";

loadEnv();

const to = process.argv[2] || process.env.IMESSAGE_TO || process.env.STYLIST_PHONE || "";
const body = process.argv[3] || "A-port stylist test ✅ — if you got this, iMessage works.";

if (!to) {
  console.error('Usage: npx tsx agents/imessage-test.ts "<phone-or-appleid>" ["message"]');
  process.exitCode = 1;
} else {
  sendIMessage(to, body)
    .then((r) => console.log(r.simulated ? "simulated (see above)" : `sent → ${to}`))
    .catch((error: Error) => {
      console.error("iMessage failed:", error.message);
      console.error("Checks: Messages.app signed into iMessage, and approve the Automation prompt (System Settings → Privacy & Security → Automation).");
      process.exitCode = 1;
    });
}
