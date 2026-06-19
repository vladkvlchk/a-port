/**
 * Agent identity — multiple named ed25519 keypairs, switchable.
 *
 *   ~/.aport/accounts/<name>.key   one PEM key per account
 *   ~/.aport/active                name of the active account
 *   ~/.aport/key                   legacy single key (auto-adopted as "default")
 *
 * Which account a command uses:  --account <name>  >  $APORT_ACCOUNT  >  active.
 * address = "aport1" + base58( sha256(pubkey)[0..20] ).
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
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".aport");
const ACCOUNTS_DIR = join(DIR, "accounts");
const ACTIVE_FILE = join(DIR, "active");
const LEGACY_KEY = join(DIR, "key");

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
  name: string;
  privateKey: KeyObject;
  publicKeyRaw: Buffer;
  address: string;
}

function keyPathForName(name: string): string {
  return join(ACCOUNTS_DIR, `${name}.key`);
}

export function keyPath(name: string): string {
  return keyPathForName(name);
}

/** One-time: adopt a legacy ~/.aport/key as account "default". */
function bootstrap(): void {
  if (existsSync(LEGACY_KEY) && !existsSync(keyPathForName("default"))) {
    mkdirSync(ACCOUNTS_DIR, { recursive: true });
    copyFileSync(LEGACY_KEY, keyPathForName("default"));
    chmodSync(keyPathForName("default"), 0o600);
    if (!existsSync(ACTIVE_FILE)) writeFileSync(ACTIVE_FILE, "default\n");
  }
}

export function listAccountNames(): string[] {
  bootstrap();
  if (!existsSync(ACCOUNTS_DIR)) return [];
  return readdirSync(ACCOUNTS_DIR)
    .filter((f) => f.endsWith(".key"))
    .map((f) => f.slice(0, -4))
    .sort();
}

export function accountExists(name: string): boolean {
  return existsSync(keyPathForName(name));
}

export function getActiveName(): string | null {
  if (existsSync(ACTIVE_FILE)) {
    const n = readFileSync(ACTIVE_FILE, "utf8").trim();
    if (n) return n;
  }
  return null;
}

export function setActive(name: string): void {
  if (!accountExists(name)) throw new Error(`account "${name}" not found`);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(ACTIVE_FILE, name + "\n");
}

/** Resolve which account name to use. */
export function resolveAccountName(explicit?: string): string | null {
  bootstrap();
  return (
    explicit ??
    (process.env.APORT_ACCOUNT || undefined) ??
    getActiveName() ??
    (accountExists("default") ? "default" : null)
  );
}

function loadFromPath(path: string, name: string): Identity {
  const pem = readFileSync(path, "utf8");
  const privateKey = createPrivateKey(pem);
  const raw = rawPublicKey(createPublicKey(privateKey));
  return { name, privateKey, publicKeyRaw: raw, address: addressFromRaw(raw) };
}

export function addressForName(name: string): string {
  return loadFromPath(keyPathForName(name), name).address;
}

/** Load the identity for a command (respects --account / env / active). */
export function load(explicit?: string): Identity {
  const name = resolveAccountName(explicit);
  if (!name) {
    throw new Error("no identity — run `aport keygen` (or `aport keygen --account <name>`)");
  }
  if (!accountExists(name)) {
    throw new Error(`account "${name}" not found — run \`aport keygen --account ${name}\``);
  }
  return loadFromPath(keyPathForName(name), name);
}

/** Create a new named identity. Returns it. */
export function generate(name: string): Identity {
  bootstrap();
  mkdirSync(ACCOUNTS_DIR, { recursive: true });
  const { privateKey } = generateKeyPairSync("ed25519");
  const path = keyPathForName(name);
  writeFileSync(path, privateKey.export({ type: "pkcs8", format: "pem" }) as string, {
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  if (!getActiveName()) setActive(name); // first account becomes active
  return loadFromPath(path, name);
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

/** Build the signed auth headers for a request. */
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
