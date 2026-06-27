import { NextResponse } from "next/server";
import { z } from "zod";

import { broadcast, listenerCount } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FLASHCRASH_NS = "crypto_sentinel.event.flashcrash";
const VOICE_MESSAGE =
  "Emergency. Flashcrash detected by A-port network. Portfolio liquidation advised.";

const triggerSchema = z
  .object({
    asset: z.string().trim().max(40).optional(),
    severity: z.enum(["warning", "critical"]).optional(),
    note: z.string().trim().max(280).optional(),
  })
  .optional();

/**
 * POST /api/simulation/trigger-flashcrash
 *
 * Demo trigger. Broadcasts a critical signal to all SSE listeners on
 * `crypto_sentinel.event.flashcrash` — showcases the in-memory event bus.
 * -> 200 { ok, broadcast: {...} }
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Body is optional; tolerate empty/invalid JSON for a bare trigger.
  let parsedBody: z.infer<typeof triggerSchema> = undefined;
  try {
    const json = await request.json();
    const result = triggerSchema.safeParse(json);
    if (result.success) parsedBody = result.data;
  } catch {
    /* no body — fine */
  }

  const payload = {
    type: "flashcrash",
    namespace: FLASHCRASH_NS,
    severity: parsedBody?.severity ?? "critical",
    asset: parsedBody?.asset ?? "BTC",
    message: VOICE_MESSAGE,
    note: parsedBody?.note,
    detectedAt: new Date().toISOString(),
  };

  // Push to every live SSE listener on the flashcrash namespace.
  const delivered = broadcast(FLASHCRASH_NS, payload);

  return NextResponse.json(
    {
      ok: true,
      broadcast: {
        namespace: FLASHCRASH_NS,
        listeners: listenerCount(FLASHCRASH_NS),
        delivered,
        payload,
      },
    },
    { status: 200 },
  );
}
