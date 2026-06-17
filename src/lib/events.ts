/**
 * In-memory pub/sub for `.event` namespaces (SSE broadcasting).
 *
 * Listeners subscribe by namespace; `broadcast()` fans a payload out to every
 * active listener. State lives on `globalThis` so it survives Next.js dev HMR
 * and is shared across route modules within one server instance.
 *
 * Limitation: this is per-instance memory. On a multi-instance/serverless
 * deployment (e.g. Vercel) a broadcast only reaches listeners attached to the
 * same instance. For the demo (single dev/prod server) that is sufficient; a
 * production fan-out would back this with Redis Pub/Sub or Postgres LISTEN.
 */

export type EventListener = (data: string) => void;

interface EventBus {
  channels: Map<string, Set<EventListener>>;
}

const globalRef = globalThis as typeof globalThis & {
  __aportEventBus?: EventBus;
};

const bus: EventBus = (globalRef.__aportEventBus ??= {
  channels: new Map(),
});

/** Subscribe to a namespace. Returns an unsubscribe function. */
export function subscribe(namespace: string, listener: EventListener): () => void {
  let set = bus.channels.get(namespace);
  if (!set) {
    set = new Set();
    bus.channels.set(namespace, set);
  }
  set.add(listener);

  return () => {
    const current = bus.channels.get(namespace);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) bus.channels.delete(namespace);
  };
}

/**
 * Broadcast a payload to every listener on a namespace.
 * @returns the number of listeners the payload was delivered to.
 */
export function broadcast(namespace: string, payload: unknown): number {
  const set = bus.channels.get(namespace);
  if (!set || set.size === 0) return 0;

  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const listener of set) {
    try {
      listener(data);
    } catch {
      // a broken listener must not abort the fan-out
    }
  }
  return set.size;
}

/** Current listener count for a namespace (0 if none). */
export function listenerCount(namespace: string): number {
  return bus.channels.get(namespace)?.size ?? 0;
}
