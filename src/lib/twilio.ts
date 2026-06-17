/**
 * Twilio emergency broadcast helper.
 *
 * Sends an SMS and places an automated voice call to every configured number
 * via the Twilio REST API (no SDK dependency — Basic-auth fetch). When the
 * Twilio env vars are absent it runs in SIMULATED mode and returns the payload
 * it *would* have sent, so the simulation endpoint works before keys exist.
 *
 * Required env for live mode:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER        (the "from" number)
 *   TWILIO_ALERT_NUMBERS       (comma-separated "to" numbers)
 */

export interface TwilioDelivery {
  to: string;
  channel: "sms" | "voice";
  ok: boolean;
  sid?: string;
  error?: string;
}

export interface TwilioBroadcastResult {
  simulated: boolean;
  message: string;
  recipients: string[];
  deliveries: TwilioDelivery[];
}

function getConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const to = (process.env.TWILIO_ALERT_NUMBERS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const configured = Boolean(accountSid && authToken && from && to.length > 0);
  return { accountSid, authToken, from, to, configured };
}

async function twilioPost(
  accountSid: string,
  authToken: string,
  resource: "Messages" | "Calls",
  form: Record<string, string>,
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${resource}.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, sid: data.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Broadcast an emergency message over SMS + automated voice call.
 * Returns a per-recipient delivery report (or a simulated one).
 */
export async function emergencyBroadcast(
  message: string,
): Promise<TwilioBroadcastResult> {
  const { accountSid, authToken, from, to, configured } = getConfig();

  if (!configured) {
    console.warn(
      "[twilio] credentials missing — SIMULATING SMS + voice broadcast.",
    );
    const recipients = to.length > 0 ? to : ["+1XXXXXXXXXX"];
    return {
      simulated: true,
      message,
      recipients,
      deliveries: recipients.flatMap((n): TwilioDelivery[] => [
        { to: n, channel: "sms", ok: true, sid: "SIMULATED" },
        { to: n, channel: "voice", ok: true, sid: "SIMULATED" },
      ]),
    };
  }

  // TwiML for the spoken message on the voice call.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${message}</Say></Response>`;

  const deliveries: TwilioDelivery[] = [];
  for (const number of to) {
    const sms = await twilioPost(accountSid!, authToken!, "Messages", {
      To: number,
      From: from!,
      Body: message,
    });
    deliveries.push({ to: number, channel: "sms", ...sms });

    const call = await twilioPost(accountSid!, authToken!, "Calls", {
      To: number,
      From: from!,
      Twiml: twiml,
    });
    deliveries.push({ to: number, channel: "voice", ...call });
  }

  return { simulated: false, message, recipients: to, deliveries };
}
