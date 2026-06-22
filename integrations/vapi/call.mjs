#!/usr/bin/env node
/**
 * The agent CALLS the user's phone and has a live, TWO-WAY conversation — via
 * Vapi (AI voice agent) over the Telnyx SIP trunk. One API call kicks it off;
 * Vapi then listens to the user and talks back until the matter is resolved.
 *
 *   node integrations/vapi/call.mjs "BTC just dropped 9% on heavy volume."
 *   node integrations/vapi/call.mjs "<opening>" "+380681437625"               # explicit destination
 *   node integrations/vapi/call.mjs "<opening>" "" "<context to discuss>"     # give it details to talk about
 *
 * Env (.env): VAPI_PRIVATE_KEY, VAPI_PHONE_NUMBER_ID (the Telnyx BYO number),
 * VAPI_ASSISTANT_ID (the conversational English assistant), EMERGENCY_PHONE.
 *   arg1  opening line the agent speaks first (dynamic per call)
 *   arg2  destination E.164 (optional; defaults to EMERGENCY_PHONE)
 *   arg3  context the agent uses to hold the conversation (optional; defaults to arg1)
 *
 * NB: calls land on Kyivstar (Vodafone filters foreign-originated calls). The
 * conversational persona lives in setup-assistant.mjs ({{context}} = arg3).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from the repo root regardless of the caller's cwd, so an agent can
// invoke this from anywhere (e.g. a Hermes session running from $HOME).
for (const candidate of [
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env"),
  ".env",
]) {
  if (existsSync(candidate)) {
    try {
      process.loadEnvFile(candidate);
      break;
    } catch {
      /* ignore */
    }
  }
}

const KEY = process.env.VAPI_PRIVATE_KEY;
const PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const TO = process.argv[3] || process.env.EMERGENCY_PHONE;
const message = process.argv[2] || "This is a test call from your A-port agent.";
const context = process.argv[4] || message;

if (!KEY || !PHONE_NUMBER_ID || !ASSISTANT_ID || !TO) {
  console.error(
    "missing config — need in .env: VAPI_PRIVATE_KEY, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID, EMERGENCY_PHONE (or pass a destination as the 2nd arg).",
  );
  process.exit(1);
}

if (process.env.DRY_RUN === "1") {
  console.log(`[DRY_RUN] would call ${TO} — first line: "${message.slice(0, 120)}"`);
  process.exit(0);
}

const res = await fetch("https://api.vapi.ai/call", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    phoneNumberId: PHONE_NUMBER_ID,
    assistantId: ASSISTANT_ID,
    customer: { number: TO },
    assistantOverrides: {
      firstMessage: message,
      variableValues: { context },
    },
  }),
});
const json = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`✗ Vapi ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  process.exit(1);
}
console.log(`✓ calling ${TO} — call ${json.id}, status ${json.status}`);
