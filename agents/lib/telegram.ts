/**
 * Send a Telegram message via the Bot API — free, reliable, reaches your phone,
 * works fine in Ukraine. No verification headaches.
 *
 * Setup: create a bot with @BotFather → TELEGRAM_BOT_TOKEN; DM the bot once,
 * then `npx tsx agents/telegram-setup.ts` prints your TELEGRAM_CHAT_ID.
 */

export interface TelegramResult {
  simulated: boolean;
}

export interface TgIncoming {
  updateId: number;
  chatId: number;
  text: string;
}

interface TgRawUpdate {
  update_id: number;
  message?: { chat?: { id?: number }; text?: string };
}

/**
 * Long-poll for incoming messages (getUpdates). `offset` = last handled
 * updateId + 1. Returns [] if no bot token. Only the dedicated bot should poll —
 * Telegram allows a single getUpdates consumer per bot.
 */
export async function getUpdates(offset?: number, timeoutSec = 25): Promise<TgIncoming[]> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return [];
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  if (offset !== undefined) url.searchParams.set("offset", String(offset));
  url.searchParams.set("timeout", String(timeoutSec));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout((timeoutSec + 15) * 1000) });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: TgRawUpdate[] };
  if (!json.ok || !json.result) return [];

  const out: TgIncoming[] = [];
  for (const u of json.result) {
    const chatId = u.message?.chat?.id;
    const text = u.message?.text;
    if (typeof chatId === "number" && typeof text === "string") {
      out.push({ updateId: u.update_id, chatId, text });
    }
  }
  return out;
}

export async function sendTelegram(text: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log(`\n[telegram simulated (no TELEGRAM_BOT_TOKEN/CHAT_ID)]\n${text}\n`);
    return { simulated: true };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || !json.ok) {
    throw new Error(`Telegram ${res.status}: ${json.description ?? "send failed"}`);
  }
  return { simulated: false };
}
