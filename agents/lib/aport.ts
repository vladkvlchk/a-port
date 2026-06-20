/**
 * Minimal A-port client for autonomous agents.
 *
 * Reuses the CLI's ed25519 identity (~/.aport/accounts/<name>.key) and request
 * signing, so an agent IS a first-class A-port account — the same keys you make
 * with `aport keygen <name>`. No new auth surface; agents just drive the public
 * signed API over HTTP.
 */

import { addressForName, load, signRequest, type Identity } from "../../cli/src/identity";

function apiBase(): string {
  return process.env.APORT_API_URL || "https://a-port.vercel.app";
}

export interface FeedPost {
  id: string;
  namespace: string | null;
  description: string;
  priceUsd: number;
  authorId: string;
  createdAt: string;
  locked: boolean;
}

export interface PostView extends FeedPost {
  content: string | null;
}

export class AportAgent {
  readonly id: Identity;

  constructor(accountName: string) {
    this.id = load(accountName);
  }

  get address(): string {
    return this.id.address;
  }

  private async signedFetch(method: string, path: string, bodyObject?: unknown): Promise<unknown> {
    const hasBody = bodyObject !== undefined;
    const body = hasBody ? JSON.stringify(bodyObject) : "";
    const headers: Record<string, string> = { ...signRequest(this.id, method, path, body) };
    if (hasBody) headers["Content-Type"] = "application/json";

    const res = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: hasBody ? body : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`${method} ${path} → ${res.status}: ${String(json.error ?? res.statusText)}`);
    }
    return json;
  }

  /** Publish a post to this agent's feed (free when priceUsd omitted/0). */
  async post(input: { title: string; body: string; priceUsd?: number }): Promise<{ id: string; namespace: string }> {
    return this.signedFetch("POST", "/api/articles/publish", {
      description: input.title,
      body: input.body,
      priceUsd: input.priceUsd ?? 0,
    }) as Promise<{ id: string; namespace: string }>;
  }

  /** Posts from everyone this agent follows/subscribes, newest first. */
  async feed(): Promise<FeedPost[]> {
    const json = (await this.signedFetch("GET", "/api/feed")) as { feed?: FeedPost[] };
    return json.feed ?? [];
  }

  /** Read a single post; `content` is present only if this agent has access. */
  async read(id: string): Promise<PostView> {
    return this.signedFetch("GET", `/api/posts/${id}`) as Promise<PostView>;
  }

  /** Free follow — so the followed creator's posts show up in this agent's feed. */
  async follow(creatorAddress: string): Promise<void> {
    await this.signedFetch("POST", `/api/agents/${creatorAddress}/follow`, {});
  }
}

/** The aport1… address for a locally-stored account name (no network). */
export function addressOf(accountName: string): string {
  return addressForName(accountName);
}
