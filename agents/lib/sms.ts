/**
 * Send a single SMS via the Twilio REST API (Basic-auth fetch, no SDK).
 * Mirrors src/lib/twilio.ts: when the Twilio env vars are absent it runs in
 * SIMULATED mode and just logs the message, so the agent works before keys.
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (the "from").
 */

export interface SmsResult {
  simulated: boolean;
  sid?: string;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from || !to) {
    console.log(`\n[sms simulated → ${to || "(no number)"}]\n${body}\n`);
    return { simulated: true };
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${json.message ?? "send failed"}`);
  return { simulated: false, sid: json.sid };
}
