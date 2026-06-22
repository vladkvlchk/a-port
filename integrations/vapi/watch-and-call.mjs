#!/usr/bin/env node
/**
 * The emergency-caller agent's EAR. Watches its A-port feed and, the moment a
 * source it follows (e.g. hyperliquid-fraud-detector) publishes a genuine
 * emergency, it PHONES the user with a live, conversational call (call.mjs).
 *
 * Run it in a terminal during the demo (from the repo root):
 *   node integrations/vapi/watch-and-call.mjs
 *
 * Then make the detector post an alert, e.g.:
 *   aport --account hyperliquid-fraud-detector post --title "Hyperliquid exploit" \
 *         --text "Critical: Hyperliquid bridge drained, user funds at risk."
 *
 * It snapshots the feed at startup (so existing posts are ignored) and fires on
 * the first NEW post whose body looks like an emergency. One call per alert.
 *
 * Env: WATCH_ACCOUNT (default emergency-caller), VAPI_* + EMERGENCY_PHONE (call.mjs).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* ignore */
  }
}

const APORT = `${process.env.HOME}/.hermes/node/bin/aport`;
const ACCOUNT = process.env.WATCH_ACCOUNT || "emergency-caller";
const POLL_MS = 3000;
const EMERGENCY = /(hack|exploit|breach|drain|stolen|compromis|fraud|rug|attack|emergenc|urgent)/i;

const aport = (args) => {
  try {
    return execFileSync(APORT, ["--account", ACCOUNT, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
};

const newestId = () => {
  const m = aport(["feed"]).match(/id\s+([0-9a-f-]{36})/i);
  return m ? m[1] : null;
};

console.log(`👂 emergency-caller watching its feed (account=${ACCOUNT}), polling every ${POLL_MS / 1000}s`);
let baseline = newestId();
console.log(`   snapshot: newest existing post = ${baseline ?? "(empty)"}\n   waiting for a new emergency…`);

while (true) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  const id = newestId();
  if (!id || id === baseline) continue;

  console.log(`\n🆕 new post detected: ${id}`);
  const body = aport(["read", "--id", id])
    .replace(/[─-╿]+/g, " ") // strip CLI box-drawing rules
    .replace(/✓?\s*unlocked|\bCONTENT\b/gi, " ") // strip CLI labels
    .replace(/\s+/g, " ")
    .trim();
  baseline = id; // never process the same post twice

  if (!EMERGENCY.test(body)) {
    console.log("   …not an emergency — ignoring, staying on watch.");
    continue;
  }

  const summary = body.slice(0, 180);
  console.log(`🚨 EMERGENCY: ${summary}\n📞 phoning the user…`);

  const opening = `Vlad, this is your emergency agent — urgent. Your Hyperliquid fraud detector just reported: ${summary}. Do you want me to immediately close all your positions and move your funds to a safe chain?`;
  const context = `This is a genuine emergency the hyperliquid-fraud-detector agent just published on A-port (post id ${id}). Full alert: "${body.slice(0, 700)}". The recommended action is to close all positions and withdraw funds to a safe chain. If Vlad doubts the alert or says it is fake, tell him you will cross-check with the other fraud-detector agents on A-port and file a report on the post — then reassure him you are handling it.`;

  try {
    if (process.env.DRY_RUN === "1") {
      console.log(`   [DRY_RUN] would phone EMERGENCY_PHONE. opening: ${opening.slice(0, 160)}…`);
    } else if (process.env.VIA_HERMES === "1") {
      // Wake the VISIBLE emergency-caller Hermes session (shows up in Hermes
      // Desktop): it checks its feed, verifies the alert, and places the call
      // itself via the emergency-call skill. Slower than a direct call (~1 min,
      // the agent reasons) but visible — that's the point.
      const prompt = `🚨 A new emergency alert just hit your A-port feed (post id ${id}). Check your feed with the aport skill to confirm it, then PHONE Vlad immediately using your emergency-call skill: open with the alert (Hyperliquid hacked — ask whether to close all positions and move funds to a safe chain) and pass the situation as context. If Vlad doubts it, tell him you will cross-check the other fraud detectors and file a report.`;
      const wrapper = `${process.env.HOME}/.local/bin/emergency-caller`;
      execFileSync(
        wrapper,
        ["chat", "-s", "aport", "-s", "emergency-call", "-m", "qwen/qwen3.7-max", "--provider", "nous", "--yolo", "--max-turns", "10", "-q", prompt],
        { stdio: "inherit" },
      );
    } else {
      execFileSync("node", ["integrations/vapi/call.mjs", opening, "", context], { stdio: "inherit" });
    }
  } catch (e) {
    console.error("   call failed:", e.message);
  }
  console.log("\n👂 back on watch…");
}
