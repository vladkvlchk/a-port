import { subscribe } from "@/lib/events";

// SSE requires the Node.js runtime and an uncached, streamed response.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEP_ALIVE_MS = 15_000;

/**
 * GET /api/events/listen?ns=<namespace>
 *
 * Opens a Server-Sent Events stream and keeps it alive, forwarding every
 * payload broadcast to `ns` in real time. AI agents hold this connection open
 * to listen for `.event` namespace broadcasts (e.g. flashcrash signals).
 */
export async function GET(request: Request): Promise<Response> {
  const ns = new URL(request.url).searchParams.get("ns");
  if (!ns) {
    return new Response("Missing required query param 'ns'.", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const sendEvent = (event: string, data: string) => {
        safeEnqueue(`event: ${event}\ndata: ${data}\n\n`);
      };

      // Handshake so the client knows it's connected.
      sendEvent(
        "connected",
        JSON.stringify({ ns, ts: new Date().toISOString() }),
      );

      const unsubscribe = subscribe(ns, (data) => sendEvent("message", data));

      // Comment heartbeats keep proxies from closing an idle connection.
      const keepAlive = setInterval(() => safeEnqueue(`: keep-alive\n\n`), KEEP_ALIVE_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (e.g. nginx) so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
