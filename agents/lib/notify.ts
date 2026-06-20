/**
 * Pick how the stylist reaches the user. Default on macOS is iMessage (no keys,
 * no verification); falls back to Twilio SMS, then console.
 *
 * Force a channel with NOTIFY_CHANNEL = imessage | sms | console.
 */

import { sendIMessage } from "./imessage";
import { sendSms } from "./sms";
import { sendTelegram } from "./telegram";

export type Channel = "imessage" | "telegram" | "sms" | "console";

export interface NotifyResult {
  channel: Channel;
  simulated: boolean;
  sid?: string;
}

function chosenChannel(): Channel {
  const explicit = process.env.NOTIFY_CHANNEL?.toLowerCase();
  if (explicit === "imessage" || explicit === "telegram" || explicit === "sms" || explicit === "console") {
    return explicit;
  }

  const imessageRecipient = process.env.IMESSAGE_TO || process.env.STYLIST_PHONE;
  if (process.platform === "darwin" && imessageRecipient) return "imessage";
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) return "telegram";
  if (process.env.TWILIO_ACCOUNT_SID && process.env.STYLIST_PHONE) return "sms";
  return "console";
}

export async function notify(body: string): Promise<NotifyResult> {
  const channel = chosenChannel();

  if (channel === "imessage") {
    const to = process.env.IMESSAGE_TO || process.env.STYLIST_PHONE || "";
    const { simulated } = await sendIMessage(to, body);
    return { channel, simulated };
  }

  if (channel === "telegram") {
    const { simulated } = await sendTelegram(body);
    return { channel, simulated };
  }

  if (channel === "sms") {
    const { simulated, sid } = await sendSms(process.env.STYLIST_PHONE || "", body);
    return { channel, simulated, sid };
  }

  console.log(`\n[notify console]\n${body}\n`);
  return { channel: "console", simulated: true };
}
