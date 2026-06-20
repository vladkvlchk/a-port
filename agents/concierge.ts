/**
 * Your personal agent — the top of your agent hierarchy and the single channel
 * through which information and other agents reach you.
 *   brain: Hermes (Nous) · I/O: Telegram (2-way) · data: the A-port network.
 *
 * It coordinates sub-agents you follow on A-port (today: the California weather
 * agent; add more as you publish them) and answers you directly. The morning
 * outfit is just one of its jobs.
 *
 *   npx tsx agents/concierge.ts --listen        # chat with it on Telegram (long-running)
 *   npx tsx agents/concierge.ts --ask "..."     # one question → reply (test / scripted)
 *   npx tsx agents/concierge.ts --briefing      # proactive morning briefing
 *
 * Env: ASSISTANT_ACCOUNT (default "stylist"), WEATHER_ACCOUNT, OWNER_NAME,
 *      MEETING_CONTEXT, TELEGRAM_*, NOUS_API_KEY, WARDROBE_PATH.
 */

import { existsSync, readFileSync } from "node:fs";

import { AportAgent, addressOf } from "./lib/aport";
import { loadEnv } from "./lib/env";
import { chooseOutfit, hermesChat, type Wardrobe } from "./lib/hermes";
import { getUpdates, sendTelegram } from "./lib/telegram";

loadEnv();

const ACCOUNT = process.env.ASSISTANT_ACCOUNT || process.env.STYLIST_ACCOUNT || "stylist";
const WEATHER_ACCOUNT = process.env.WEATHER_ACCOUNT || "weather";
const OWNER = process.env.OWNER_NAME || "the user";
const MEETING =
  process.env.MEETING_CONTEXT || "an important meeting with the director of Nvidia at their Santa Clara HQ";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function loadWardrobe(): Wardrobe {
  const candidates = [process.env.WARDROBE_PATH, ".local/wardrobe.json", "agents/wardrobe.example.json"].filter(
    Boolean,
  ) as string[];
  const path = candidates.find((p) => existsSync(p));
  return path ? (JSON.parse(readFileSync(path, "utf8")) as Wardrobe) : {};
}

function weatherAddress(): string | null {
  if (process.env.WEATHER_AGENT_ADDRESS) return process.env.WEATHER_AGENT_ADDRESS;
  try {
    return addressOf(WEATHER_ACCOUNT);
  } catch {
    return null;
  }
}

interface Context {
  now: string;
  weatherText: string;
  wardrobe: Wardrobe;
}

/** Pull what the personal agent knows right now from its A-port sub-agents. */
async function gatherContext(agent: AportAgent): Promise<Context> {
  let weatherText = "(no weather posted yet)";
  const wx = weatherAddress();
  if (wx) {
    try {
      await agent.follow(wx).catch(() => {}); // ensure the forecast is in our feed
      const feed = await agent.feed();
      const top = feed[0];
      if (top) {
        const full = await agent.read(top.id);
        weatherText = full.content ?? top.description;
      }
    } catch {
      /* leave the placeholder */
    }
  }
  const now = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return { now, weatherText, wardrobe: loadWardrobe() };
}

function systemPrompt(): string {
  return [
    `You are ${OWNER}'s personal chief-of-staff agent: the top of their agent hierarchy and the single point through which information and other agents reach them.`,
    `You coordinate sub-agents on the A-port network (currently a California weather agent) and answer ${OWNER} directly and concisely, in their language.`,
    `Upcoming for ${OWNER}: ${MEETING}.`,
    `Use the CONTEXT block for facts (weather, wardrobe, time). For weather or outfit questions, rely on the forecast there. Keep chat replies short and useful.`,
  ].join(" ");
}

async function answer(agent: AportAgent, message: string): Promise<string> {
  const ctx = await gatherContext(agent);
  const user = [
    "CONTEXT",
    `- now: ${ctx.now}`,
    "- California forecast (from the weather sub-agent):",
    ctx.weatherText,
    `- ${OWNER}'s wardrobe (JSON): ${JSON.stringify(ctx.wardrobe)}`,
    "",
    `${OWNER} says: ${message}`,
  ].join("\n");
  try {
    return await hermesChat(systemPrompt(), user);
  } catch (error) {
    return `(brain offline: ${(error as Error).message})`;
  }
}

async function briefing(agent: AportAgent): Promise<void> {
  const ctx = await gatherContext(agent);
  const { text, via } = await chooseOutfit({ weatherText: ctx.weatherText, wardrobe: ctx.wardrobe, meeting: MEETING });
  const sent = await sendTelegram(`☀️ Morning briefing\n\n${text}`);
  console.log(`[concierge] briefing (via ${via}) ${sent.simulated ? "SIMULATED" : "sent"}`);
}

async function listen(agent: AportAgent): Promise<void> {
  console.log(`[concierge] listening on Telegram as ${agent.address} … (Ctrl+C to stop)`);
  // Skip backlog so we don't reply to old messages on startup.
  let offset: number | undefined;
  const backlog = await getUpdates(offset, 0).catch(() => []);
  const last = backlog[backlog.length - 1];
  if (last) offset = last.updateId + 1;

  for (;;) {
    let msgs: Awaited<ReturnType<typeof getUpdates>>;
    try {
      msgs = await getUpdates(offset, 25);
    } catch (error) {
      console.error("[concierge] poll error:", (error as Error).message);
      await sleep(3000);
      continue;
    }
    for (const m of msgs) {
      offset = m.updateId + 1;
      if (CHAT_ID && String(m.chatId) !== CHAT_ID) continue; // only the owner
      console.log(`[concierge] ◀ ${m.text}`);
      const reply = await answer(agent, m.text);
      console.log(`[concierge] ▶ ${reply}`);
      await sendTelegram(reply).catch((e: Error) => console.error("[concierge] send error:", e.message));
    }
  }
}

const agent = new AportAgent(ACCOUNT);
const argv = process.argv.slice(2);
const askIdx = argv.indexOf("--ask");

if (askIdx >= 0) {
  const question = argv[askIdx + 1] ?? "";
  answer(agent, question)
    .then(async (reply) => {
      console.log(`[concierge] ▶ ${reply}`);
      const sent = await sendTelegram(reply);
      console.log(`[concierge] telegram ${sent.simulated ? "SIMULATED" : `sent → chat ${CHAT_ID}`}`);
    })
    .catch((error: Error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
} else if (argv.includes("--briefing")) {
  briefing(agent).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
} else {
  listen(agent).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
