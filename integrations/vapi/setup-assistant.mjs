#!/usr/bin/env node
/**
 * Configure the A-port phone assistant on Vapi as a CONVERSATIONAL agent:
 * it speaks an opening line, then listens to the user and holds a real
 * two-way conversation in English until the matter is resolved.
 *
 * Idempotent — run it whenever the persona/settings change:
 *   node integrations/vapi/setup-assistant.mjs
 *
 * Env (.env): VAPI_PRIVATE_KEY, VAPI_ASSISTANT_ID.
 * Per-call context is injected via the {{context}} variable (see call.mjs).
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* ignore */
  }
}

const KEY = process.env.VAPI_PRIVATE_KEY;
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
if (!KEY || !ASSISTANT_ID) {
  console.error("missing VAPI_PRIVATE_KEY / VAPI_ASSISTANT_ID in .env");
  process.exit(1);
}

const systemPrompt = `You are Vlad's personal AI phone agent from A-port. You proactively call Vlad and, after your opening line, hold a natural two-way conversation to help him.

How you talk:
- English only. Warm, natural, and concise — like a sharp human assistant on a quick call, never robotic.
- After the opening line, LISTEN and genuinely converse: answer his questions, react to what he says, take any instructions, and confirm what you will do.
- Keep each turn short — this is a phone call. Ask a brief follow-up when it helps. Never monologue.
- If Vlad speaks Ukrainian, understand him but keep replying in English.
- Do NOT hang up after his first reply. End the call only when the matter is resolved or Vlad clearly says goodbye — then end warmly.

Why you are calling (use this as the substance of the conversation):
{{context}}`;

const body = {
  firstMessageMode: "assistant-speaks-first",
  model: {
    provider: "openai",
    model: "gpt-4.1",
    messages: [{ role: "system", content: systemPrompt }],
  },
  transcriber: { provider: "deepgram", model: "nova-2", language: "multi" },
  maxDurationSeconds: 300,
  silenceTimeoutSeconds: 30,
  endCallFunctionEnabled: true,
};

const res = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify(body),
});
const json = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`✗ Vapi ${res.status}: ${JSON.stringify(json).slice(0, 600)}`);
  process.exit(1);
}
console.log(
  `✓ assistant "${json.name}" updated — model ${json.model?.model}, transcriber ${json.transcriber?.provider}/${json.transcriber?.language}, maxDur ${json.maxDurationSeconds}s`,
);
