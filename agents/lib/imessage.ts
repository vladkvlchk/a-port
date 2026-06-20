/**
 * Send an iMessage via Messages.app using AppleScript — macOS only, no API,
 * no keys, no phone verification. Send to your own number or Apple ID.
 *
 * First run: macOS asks to allow controlling Messages (Automation) — approve it
 * once. Messages.app must be signed into iMessage.
 *
 * Env: IMESSAGE_TO (phone like +380… or an Apple ID email). Falls back to
 * STYLIST_PHONE.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface IMessageResult {
  simulated: boolean;
}

/** Escape a value for embedding inside an AppleScript double-quoted string. */
function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function sendIMessage(to: string, body: string): Promise<IMessageResult> {
  if (process.platform !== "darwin") {
    console.log(`\n[imessage simulated (not macOS) → ${to || "(no recipient)"}]\n${body}\n`);
    return { simulated: true };
  }
  if (!to) {
    console.log(`\n[imessage simulated (no IMESSAGE_TO) ]\n${body}\n`);
    return { simulated: true };
  }

  // iMessage bodies are one line; flatten newlines so the AppleScript literal stays valid.
  const text = body.replace(/\r?\n+/g, " ").trim();
  const script = [
    'tell application "Messages"',
    "  set targetService to 1st service whose service type = iMessage",
    `  set targetBuddy to buddy "${esc(to)}" of targetService`,
    `  send "${esc(text)}" to targetBuddy`,
    "end tell",
  ].join("\n");

  await run("osascript", ["-e", script]);
  return { simulated: false };
}
