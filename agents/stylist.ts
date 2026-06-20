/**
 * Agent #2 — personal stylist.
 * Every run: read the latest weather_california post from its A-port feed,
 * combine it with the user's wardrobe and a fixed "important meeting tomorrow"
 * persona, ask Hermes (Nous) what to wear, and SMS it to the user.
 *
 *   npx tsx agents/stylist.ts             # run once
 *   npx tsx agents/stylist.ts --every 1440  # loop daily
 *
 * Setup: `aport keygen stylist`. The stylist auto-follows the local `weather`
 * account (or WEATHER_AGENT_ADDRESS) so its feed carries the forecast.
 * Env: STYLIST_ACCOUNT, WEATHER_ACCOUNT|WEATHER_AGENT_ADDRESS, STYLIST_PHONE,
 *      WARDROBE_PATH, MEETING_CONTEXT, NOUS_API_KEY, TWILIO_*.
 */

import { existsSync, readFileSync } from "node:fs";

import { AportAgent, addressOf } from "./lib/aport";
import { loadEnv } from "./lib/env";
import { chooseOutfit, type Wardrobe } from "./lib/hermes";
import { notify } from "./lib/notify";

loadEnv();

const STYLIST_ACCOUNT = process.env.STYLIST_ACCOUNT || "stylist";
const WEATHER_ACCOUNT = process.env.WEATHER_ACCOUNT || "weather";
const MEETING =
  process.env.MEETING_CONTEXT || "a meeting with the director of Nvidia at their Santa Clara HQ";

function loadWardrobe(): Wardrobe {
  const candidates = [
    process.env.WARDROBE_PATH,
    ".local/wardrobe.json",
    "agents/wardrobe.example.json",
  ].filter(Boolean) as string[];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error("no wardrobe file found (set WARDROBE_PATH)");
  return JSON.parse(readFileSync(path, "utf8")) as Wardrobe;
}

function weatherAddress(): string {
  if (process.env.WEATHER_AGENT_ADDRESS) return process.env.WEATHER_AGENT_ADDRESS;
  try {
    return addressOf(WEATHER_ACCOUNT); // same machine → derive from the local key
  } catch {
    throw new Error(`set WEATHER_AGENT_ADDRESS, or create the '${WEATHER_ACCOUNT}' account`);
  }
}

async function runOnce(): Promise<void> {
  const stylist = new AportAgent(STYLIST_ACCOUNT);

  // Make sure the forecast shows up in our feed (free follow; idempotent).
  try {
    await stylist.follow(weatherAddress());
  } catch (error) {
    console.error("[stylist] follow note:", (error as Error).message);
  }

  const feed = await stylist.feed();
  const top = feed[0]; // we only follow the weather agent → newest item is the forecast
  if (!top) {
    console.log("[stylist] feed empty — has weather_california posted yet?");
    return;
  }
  const latest = await stylist.read(top.id);
  const weatherText = latest.content ?? top.description;

  const wardrobe = loadWardrobe();
  const { text, via } = await chooseOutfit({ weatherText, wardrobe, meeting: MEETING });
  console.log(`[stylist] outfit (via ${via}):\n${text}\n`);

  const sent = await notify(text);
  console.log(`[stylist] ${sent.channel} ${sent.simulated ? "SIMULATED" : `sent${sent.sid ? ` (${sent.sid})` : ""}`} → ${sent.target}`);
}

const everyIdx = process.argv.indexOf("--every");
const everyMin = everyIdx >= 0 ? Number(process.argv[everyIdx + 1]) : 0;

runOnce().catch((error: Error) => {
  console.error("[stylist] error:", error.message);
  process.exitCode = 1;
});

if (everyMin > 0) {
  console.log(`[stylist] looping every ${everyMin} min`);
  setInterval(() => {
    runOnce().catch((error: Error) => console.error("[stylist] error:", error.message));
  }, everyMin * 60_000);
}
