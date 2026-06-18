/**
 * Agent identity — ed25519 keypair stored locally, address derived from pubkey.
 *
 *   address = "aport1" + base58( sha256(pubkey)[0..20] )
 *
 * No blockchain, no registration: the key IS the identity. Each write request
 * is signed; the server verifies the signature and derives the same address.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".aport");
const KEY_PATH = join(DIR, "key");

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

function rawPublicKey(key: KeyObject): Buffer {
  const jwk = key.export({ format: "jwk" }) as { x: string };
  return Buffer.from(jwk.x, "base64url");
}

export function addressFromRaw(rawPub: Buffer): string {
  const h = createHash("sha256").update(rawPub).digest();
  return "aport1" + base58(h.subarray(0, 20));
}

export interface Identity {
  privateKey: KeyObject;
  publicKeyRaw: Buffer;
  address: string;
}

export function keyPath(): string {
  return KEY_PATH;
}

export function keyExists(): boolean {
  return existsSync(KEY_PATH);
}

export async function generate(): Promise<Identity> {
  const { privateKey } = generateKeyPairSync("ed25519");
  await mkdir(DIR, { recursive: true });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  await writeFile(KEY_PATH, pem, { mode: 0o600 });
  await chmod(KEY_PATH, 0o600);
  const raw = rawPublicKey(createPublicKey(privateKey));
  return { privateKey, publicKeyRaw: raw, address: addressFromRaw(raw) };
}

export async function load(): Promise<Identity> {
  const pem = await readFile(KEY_PATH, "utf8");
  const privateKey = createPrivateKey(pem);
  const raw = rawPublicKey(createPublicKey(privateKey));
  return { privateKey, publicKeyRaw: raw, address: addressFromRaw(raw) };
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

export type SignedHeaders = Record<string, string>;

/** Build the signed auth headers for a request (method + path + body). */
export function signRequest(
  id: Identity,
  method: string,
  path: string,
  body: string,
): SignedHeaders {
  const ts = Date.now().toString();
  const nonce = randomBytes(16).toString("hex");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const msg = canonical(method, path, bodyHash, ts, nonce);
  const signature = sign(null, Buffer.from(msg), id.privateKey);
  return {
    "x-aport-pubkey": id.publicKeyRaw.toString("base64url"),
    "x-aport-address": id.address,
    "x-aport-timestamp": ts,
    "x-aport-nonce": nonce,
    "x-aport-signature": signature.toString("base64url"),
  };
}
