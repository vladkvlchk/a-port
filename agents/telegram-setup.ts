/**
 * Print the chat IDs that have messaged your Telegram bot, so you can set
 * TELEGRAM_CHAT_ID. DM your bot first, then run this.
 *
 *   npx tsx agents/telegram-setup.ts            # reads TELEGRAM_BOT_TOKEN from .env
 *   npx tsx agents/telegram-setup.ts <token>
 */

import { loadEnv } from "./lib/env";

loadEnv();

const token = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN || "";

interface TgChat {
  id: number;
  username?: string;
  first_name?: string;
  title?: string;
}
interface TgUpdate {
  message?: { chat?: TgChat };
}

if (!token) {
  console.error("Usage: npx tsx agents/telegram-setup.ts [bot-token]  (or set TELEGRAM_BOT_TOKEN)");
  process.exitCode = 1;
} else {
  fetch(`https://api.telegram.org/bot${token}/getUpdates`)
    .then((r) => r.json() as Promise<{ result?: TgUpdate[] }>)
    .then((j) => {
      const chats = new Map<string, string>();
      for (const u of j.result ?? []) {
        const c = u.message?.chat;
        if (c) chats.set(String(c.id), c.username ?? c.first_name ?? c.title ?? "");
      }
      if (chats.size === 0) {
        console.log("No messages yet — open your bot in Telegram, send it any message, then re-run.");
        return;
      }
      console.log("Chats that messaged your bot — put one in .env:");
      for (const [id, name] of chats) console.log(`  TELEGRAM_CHAT_ID=${id}   (${name})`);
    })
    .catch((error: Error) => {
      console.error("getUpdates failed:", error.message);
      process.exitCode = 1;
    });
}
