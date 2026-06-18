/**
 * Request authentication via signed headers (no sessions, no passwords).
 *
 * Every write request carries:
 *   x-aport-pubkey     base64url(raw 32-byte ed25519 public key)
 *   x-aport-address    aport1… (claimed identity)
 *   x-aport-timestamp  epoch ms
 *   x-aport-nonce      random hex (replay guard)
 *   x-aport-signature  base64url(ed25519 sig over the canonical message)
 *
 * The server verifies the signature, derives the address from the pubkey and
 * checks it matches the claim, then enforces a freshness window + nonce replay
 * guard. Identity = possession of the key; the account row is created lazily.
 */

import { createHash } from "node:crypto";

import { addressFromRaw, canonical, verifySignature } from "@/lib/identity";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthContext {
  address: string;
  /** base64url raw public key (as presented). */
  publicKey: string;
}

const WINDOW_MS = 120_000; // accept signatures within ±2 minutes

// In-memory nonce store (per-instance). Sufficient for the demo; back with
// Redis for multi-instance replay protection in production.
const globalRef = globalThis as typeof globalThis & {
  __aportNonces?: Map<string, number>;
};
const seenNonces: Map<string, number> = (globalRef.__aportNonces ??= new Map());

function pruneNonces(now: number): void {
  for (const [nonce, expiry] of seenNonces) {
    if (expiry < now) seenNonces.delete(nonce);
  }
}

/**
 * Authenticate a request given its raw body string (read once via
 * `request.text()`). Throws {@link AuthError} on any failure.
 */
export async function authenticate(
  request: Request,
  rawBody: string,
): Promise<AuthContext> {
  const h = request.headers;
  const pubB64 = h.get("x-aport-pubkey");
  const address = h.get("x-aport-address");
  const ts = h.get("x-aport-timestamp");
  const nonce = h.get("x-aport-nonce");
  const sigB64 = h.get("x-aport-signature");

  if (!pubB64 || !address || !ts || !nonce || !sigB64) {
    throw new AuthError("missing signature headers (run `aport keygen` and sign the request)");
  }

  const now = Date.now();
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > WINDOW_MS) {
    throw new AuthError("stale or invalid timestamp");
  }

  pruneNonces(now);
  if (seenNonces.has(nonce)) {
    throw new AuthError("nonce replay detected");
  }

  let rawPub: Buffer;
  try {
    rawPub = Buffer.from(pubB64, "base64url");
  } catch {
    throw new AuthError("invalid public key encoding");
  }
  if (rawPub.length !== 32) {
    throw new AuthError("invalid public key length");
  }
  if (addressFromRaw(rawPub) !== address) {
    throw new AuthError("address does not match public key");
  }

  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const message = canonical(request.method, path, bodyHash, ts, nonce);
  const signature = Buffer.from(sigB64, "base64url");

  if (!verifySignature(rawPub, message, signature)) {
    throw new AuthError("bad signature");
  }

  seenNonces.set(nonce, now + WINDOW_MS);
  return { address, publicKey: pubB64 };
}
