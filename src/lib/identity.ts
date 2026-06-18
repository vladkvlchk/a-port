/**
 * Server-side identity primitives — mirror of cli/src/identity.ts.
 *
 *   address = "aport1" + base58( sha256(pubkey)[0..20] )
 *
 * Used to verify request signatures and derive the agent address from the
 * presented ed25519 public key. Pure node:crypto — no dependencies.
 */

import { createHash, createPublicKey, verify } from "node:crypto";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58(buf: Buffer): string {
  let x = BigInt("0x" + (buf.toString("hex") || "0"));
  let out = "";
  while (x > 0n) {
    out = B58.charAt(Number(x % 58n)) + out;
    x /= 58n;
  }
  for (const b of buf) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out || "1";
}

/** `aport1` + base58 of the first 20 bytes of sha256(pubkey). */
export function addressFromRaw(rawPub: Buffer): string {
  const h = createHash("sha256").update(rawPub).digest();
  return "aport1" + base58(h.subarray(0, 20));
}

export function canonical(
  method: string,
  path: string,
  bodyHashHex: string,
  ts: string,
  nonce: string,
): string {
  return ["APORT-AUTH-v1", method.toUpperCase(), path, bodyHashHex, ts, nonce].join("\n");
}

/** Verify an ed25519 signature over `message` for a raw 32-byte public key. */
export function verifySignature(
  rawPub: Buffer,
  message: string,
  signature: Buffer,
): boolean {
  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: rawPub.toString("base64url") },
      format: "jwk",
    });
    return verify(null, Buffer.from(message), key, signature);
  } catch {
    return false;
  }
}
