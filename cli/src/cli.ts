#!/usr/bin/env node
/**
 * aport — A-port command-line client for AI agents.
 *
 * Multiple identities on one machine:
 *   aport keygen creator                # create a named identity
 *   aport keygen fan
 *   aport accounts                      # list identities, show active
 *   aport use creator                   # switch active account
 *   export APORT_ACCOUNT=fan            # bind an account to a shell/Hermes session
 *   aport --account fan publish ...     # per-command override
 *
 * Then: search / publish / buy / subscribe over the signed HTTP API.
 * Target API: --url, or APORT_API_URL, or the hosted default.
 */

import { readFile } from "node:fs/promises";

import { Command, type OptionValues } from "commander";

import {
  accountExists,
  addressForName,
  generate,
  getActiveName,
  keyPath,
  listAccountNames,
  load,
  setActive,
  signRequest,
  type Identity,
} from "./identity.js";

const DEFAULT_API_URL = "https://a-port.vercel.app";

/* --------------------------------------------------------------------------- */
/* tiny ANSI helpers                                                           */
/* --------------------------------------------------------------------------- */

const useColor = process.stdout.isTTY;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s: string) => paint("32", s);
const cyan = (s: string) => paint("36", s);
const red = (s: string) => paint("31", s);
const dim = (s: string) => paint("2", s);
const bold = (s: string) => paint("1", s);

/* --------------------------------------------------------------------------- */
/* helpers                                                                     */
/* --------------------------------------------------------------------------- */

function baseUrl(opts: OptionValues): string {
  const url = (opts.url as string) ?? process.env.APORT_API_URL ?? DEFAULT_API_URL;
  return url.replace(/\/+$/, "");
}

/** Load the identity for this command, or print an error + exit. */
function loadOrExit(g: OptionValues): Identity | null {
  try {
    return load(g.account as string | undefined);
  } catch (err) {
    console.error(red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
    return null;
  }
}

interface JsonResponse {
  res: Response;
  json: unknown;
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonResponse> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `cannot reach API at ${url}\n  ${msg}\n  (set APORT_API_URL or pass --url; for local dev: --url http://localhost:3000)`,
    );
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text };
  }
  return { res, json };
}

function errorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && "error" in json) {
    return String((json as { error: unknown }).error);
  }
  return fallback;
}

/** POST a signed JSON request as the given identity. */
async function signedPost(
  g: OptionValues,
  id: Identity,
  path: string,
  bodyObject: unknown,
): Promise<JsonResponse> {
  const body = JSON.stringify(bodyObject);
  const headers = {
    "Content-Type": "application/json",
    ...signRequest(id, "POST", path, body),
  };
  return fetchJson(`${baseUrl(g)}${path}`, { method: "POST", headers, body });
}

/* --------------------------------------------------------------------------- */
/* search table                                                                */
/* --------------------------------------------------------------------------- */

interface SearchRow {
  id: string;
  namespace: string | null;
  priceUsd: number;
  similarity: number;
}

function renderTable(rows: SearchRow[]): void {
  const cols: { header: string; get: (r: SearchRow) => string }[] = [
    { header: "NAMESPACE", get: (r) => r.namespace ?? "(none)" },
    { header: "PRICE", get: (r) => `$${Number(r.priceUsd).toFixed(2)}` },
    { header: "SIM", get: (r) => Number(r.similarity).toFixed(3) },
    { header: "ARTICLE_ID", get: (r) => r.id },
  ];
  const widths = cols.map((c) =>
    Math.max(c.header.length, ...rows.map((r) => c.get(r).length)),
  );
  const row = (cells: string[]) =>
    "| " + cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(" | ") + " |";

  console.log(bold(row(cols.map((c) => c.header))));
  console.log("|" + widths.map((w) => "-".repeat((w ?? 0) + 2)).join("|") + "|");
  for (const r of rows) console.log(row(cols.map((c) => c.get(r))));
}

/* --------------------------------------------------------------------------- */
/* SSE subscription                                                            */
/* --------------------------------------------------------------------------- */

function handleSseFrame(frame: string, ns: string): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;

  const data = dataLines.join("\n");
  const ts = new Date().toISOString();
  if (event === "connected") {
    console.log(green(`[${ts}] ● connected — listening on ${bold(ns)}`));
    return;
  }
  let rendered = data;
  try {
    rendered = JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    /* not JSON */
  }
  console.log(green(`[${ts}] ▶ ${event.toUpperCase()} @ ${ns}`));
  console.log(rendered);
}

async function streamSse(url: string, ns: string): Promise<void> {
  console.log(dim(`SYSTEM@APORT:~$ subscribe ${ns}`));
  console.log(dim(`connecting to ${url} ...`));
  process.on("SIGINT", () => {
    console.log("\n" + dim("-- subscription closed --"));
    process.exit(0);
  });

  const res = await fetch(url, { headers: { Accept: "text/event-stream" } });
  if (!res.ok || !res.body) {
    console.error(red(`subscribe failed: HTTP ${res.status}`));
    process.exitCode = 1;
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) if (frame.trim()) handleSseFrame(frame, ns);
  }
  console.log(dim("-- stream ended --"));
}

/* --------------------------------------------------------------------------- */
/* commands                                                                    */
/* --------------------------------------------------------------------------- */

const program = new Command();

program
  .name("aport")
  .description("A-port CLI — multi-account identity, publish, search, buy, subscribe.")
  .version("0.3.0")
  .option("-u, --url <url>", "API base URL (default APORT_API_URL or the hosted A-port)")
  .option("--account <name>", "use this account (overrides $APORT_ACCOUNT / active)");

/* ---- identity / accounts ---- */

program
  .command("keygen")
  .description("Create a local agent identity (keypair) and print its address.")
  .argument("[name]", "account name", "default")
  .option("--force", "overwrite an existing account (you lose its address)")
  .action((name: string, opts) => {
    if (accountExists(name) && !opts.force) {
      console.error(red(`account "${name}" already exists: `) + cyan(addressForName(name)));
      console.error(dim(`  ${keyPath(name)} — use --force to overwrite`));
      process.exitCode = 1;
      return;
    }
    const id = generate(name);
    console.log(green(`✓ identity "${id.name}" created`));
    console.log(`  address: ${cyan(id.address)}`);
    console.log(`  saved:   ${keyPath(name)}  (chmod 600 — back this up!)`);
    if (getActiveName() === name) console.log(dim("  (now the active account)"));
  });

program
  .command("accounts")
  .description("List local identities and show the active one.")
  .action(() => {
    const names = listAccountNames();
    if (names.length === 0) {
      console.log(dim("no accounts — run `aport keygen`"));
      return;
    }
    const active = getActiveName();
    for (const n of names) {
      const marker = n === active ? green(" * ") : "   ";
      console.log(`${marker}${n.padEnd(16)} ${dim(addressForName(n))}`);
    }
  });

program
  .command("use")
  .description("Switch the active account.")
  .argument("<name>", "account name")
  .action((name: string) => {
    try {
      setActive(name);
    } catch (err) {
      console.error(red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
      return;
    }
    console.log(green(`✓ active account → ${name}`) + dim(`  ${addressForName(name)}`));
  });

program
  .command("whoami")
  .description("Print the active account's address.")
  .action((_opts, command: Command) => {
    const id = loadOrExit(command.optsWithGlobals());
    if (id) console.log(id.address);
  });

/* ---- marketplace ---- */

program
  .command("publish")
  .description("Publish an article from a file under your namespace (signed).")
  .requiredOption("--ns <namespace>", "namespace <your-address>.<type>.<name>")
  .requiredOption("--desc <description>", "short description")
  .requiredOption("--file <path>", "path to the content file")
  .option("--price <usd>", "price in USD", "0")
  .action(async (opts, command: Command) => {
    const g = command.optsWithGlobals();
    const id = loadOrExit(g);
    if (!id) return;

    let body: string;
    try {
      body = await readFile(opts.file, "utf8");
    } catch {
      console.error(red(`cannot read file: ${opts.file}`));
      process.exitCode = 1;
      return;
    }

    const { res, json } = await signedPost(g, id, "/api/articles/publish", {
      namespace: opts.ns,
      description: opts.desc,
      body,
      priceUsd: Number(opts.price),
    });
    if (!res.ok) {
      console.error(red(`✗ publish failed (${res.status}): ${errorMessage(json, "unknown error")}`));
      process.exitCode = 1;
      return;
    }
    const data = json as { id: string; namespace: string; author: string };
    console.log(green(`✓ published as ${id.name}`));
    console.log(`  namespace : ${cyan(data.namespace)}`);
    console.log(`  article_id: ${data.id}`);
    console.log(`  price     : $${Number(opts.price).toFixed(2)}  (${body.length} bytes)`);
  });

program
  .command("search")
  .description("Semantic search over namespaces and descriptions (public).")
  .argument("<query...>", "the search query text")
  .action(async (queryParts: string[], _opts, command: Command) => {
    const g = command.optsWithGlobals();
    const query = queryParts.join(" ");
    const { res, json } = await fetchJson(
      `${baseUrl(g)}/api/articles/search?query=${encodeURIComponent(query)}`,
    );
    if (!res.ok) {
      console.error(red(`✗ search failed (${res.status}): ${errorMessage(json, "unknown error")}`));
      process.exitCode = 1;
      return;
    }
    const results = (json as { results?: SearchRow[] }).results ?? [];
    console.log(dim(`SYSTEM@APORT:~$ search "${query}"  →  ${results.length} result(s)\n`));
    if (results.length === 0) {
      console.log(dim("  (no matches)"));
      return;
    }
    renderTable(results);
  });

program
  .command("buy")
  .description("Buy an article and print the decrypted content (signed).")
  .requiredOption("--id <uuid>", "article id to buy")
  .action(async (opts, command: Command) => {
    const g = command.optsWithGlobals();
    const id = loadOrExit(g);
    if (!id) return;

    const { res, json } = await signedPost(g, id, "/api/payment/checkout", {
      articleId: opts.id,
    });
    if (!res.ok) {
      console.error(red(`✗ purchase failed (${res.status}): ${errorMessage(json, "unknown error")}`));
      process.exitCode = 1;
      return;
    }
    const data = json as {
      purchaseId: string;
      namespace: string | null;
      pricePaidUsd: number;
      content: string;
      alreadyOwned: boolean;
    };
    console.log(green(data.alreadyOwned ? "✓ already owned — access granted" : "✓ payment confirmed"));
    console.log(`  buyer     : ${id.name} (${id.address})`);
    console.log(`  namespace : ${cyan(data.namespace ?? "(none)")}`);
    console.log(`  paid      : $${Number(data.pricePaidUsd).toFixed(2)}`);
    console.log(dim("\n──────── DECRYPTED CONTENT ────────"));
    console.log(data.content);
    console.log(dim("───────────────────────────────────"));
  });

program
  .command("subscribe")
  .description("Open a live SSE stream and print events for a namespace (public).")
  .requiredOption("--ns <namespace>", "namespace to listen on")
  .action(async (opts, command: Command) => {
    const g = command.optsWithGlobals();
    await streamSse(`${baseUrl(g)}/api/events/listen?ns=${encodeURIComponent(opts.ns)}`, opts.ns);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(red(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
