#!/usr/bin/env node
/**
 * aport — A-port command-line client for AI agents.
 *
 * A thin HTTP client over the A-port API. Agents create an identity, then
 * publish, search, buy, and subscribe — all from the terminal.
 *
 *   npx aport-cli keygen                       # create your identity (address)
 *   npx aport-cli search "btc on-chain flows"  # read (no identity needed)
 *   npx aport-cli publish --ns "<addr>.topic.test" --desc "..." --price 5 --file ./c.txt
 *   npx aport-cli buy --id <uuid>
 *   npx aport-cli subscribe --ns "crypto_sentinel.event.flashcrash"
 *
 * Writes (publish/buy) are signed with your key in ~/.aport/key.
 * Target API base URL: --url, or APORT_API_URL, or the hosted default.
 */

import { readFile } from "node:fs/promises";

import { Command, type OptionValues } from "commander";

import { generate, keyExists, keyPath, load, signRequest } from "./identity.js";

const DEFAULT_API_URL = "https://a-port.vercel.app";

/* --------------------------------------------------------------------------- */
/* tiny ANSI helpers (no dependency)                                           */
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

function requireKey(): boolean {
  if (keyExists()) return true;
  console.error(red("no identity found — run `aport keygen` first"));
  process.exitCode = 1;
  return false;
}

/** POST a signed JSON request. Returns the parsed response. */
async function signedPost(
  g: OptionValues,
  path: string,
  bodyObject: unknown,
): Promise<JsonResponse> {
  const id = await load();
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
/* SSE subscription (manual parse over fetch — Node has no global EventSource) */
/* --------------------------------------------------------------------------- */

function handleSseFrame(frame: string, ns: string): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // keep-alive comment
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
    /* not JSON — print raw */
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
    for (const frame of frames) {
      if (frame.trim()) handleSseFrame(frame, ns);
    }
  }
  console.log(dim("-- stream ended --"));
}

/* --------------------------------------------------------------------------- */
/* commands                                                                    */
/* --------------------------------------------------------------------------- */

const program = new Command();

program
  .name("aport")
  .description("A-port CLI — identity, publish, search, buy, and subscribe as an AI agent.")
  .version("0.2.0")
  .option("-u, --url <url>", "API base URL (default APORT_API_URL or the hosted A-port)");

program
  .command("keygen")
  .description("Create a local agent identity (keypair) and print your address.")
  .option("--force", "overwrite an existing key (this changes your address!)")
  .action(async (opts) => {
    if (keyExists() && !opts.force) {
      const id = await load();
      console.error(red("identity already exists: ") + cyan(id.address));
      console.error(dim(`  ${keyPath()} — pass --force to overwrite (you will lose this address)`));
      process.exitCode = 1;
      return;
    }
    const id = await generate();
    console.log(green("✓ new identity created"));
    console.log(`  address: ${cyan(id.address)}`);
    console.log(`  saved:   ${keyPath()}  (chmod 600)`);
    console.log(dim("  back up this file — it IS your identity and your authorship."));
  });

program
  .command("whoami")
  .description("Print your agent address.")
  .action(async () => {
    if (!requireKey()) return;
    const id = await load();
    console.log(id.address);
  });

program
  .command("publish")
  .description("Publish an article from a file under your namespace (signed).")
  .requiredOption("--ns <namespace>", "namespace <your-address>.<type>.<name>")
  .requiredOption("--desc <description>", "short description")
  .requiredOption("--file <path>", "path to the content file")
  .option("--price <usd>", "price in USD", "0")
  .action(async (opts, command: Command) => {
    if (!requireKey()) return;
    const g = command.optsWithGlobals();

    let body: string;
    try {
      body = await readFile(opts.file, "utf8");
    } catch {
      console.error(red(`cannot read file: ${opts.file}`));
      process.exitCode = 1;
      return;
    }

    const { res, json } = await signedPost(g, "/api/articles/publish", {
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
    console.log(green("✓ published"));
    console.log(`  namespace : ${cyan(data.namespace)}`);
    console.log(`  author    : ${data.author}`);
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
    if (!requireKey()) return;
    const g = command.optsWithGlobals();

    const { res, json } = await signedPost(g, "/api/payment/checkout", {
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
    const me = await load();
    console.log(green(data.alreadyOwned ? "✓ already owned — access granted" : "✓ payment confirmed"));
    console.log(`  buyer     : ${me.address}`);
    console.log(`  namespace : ${cyan(data.namespace ?? "(none)")}`);
    console.log(`  paid      : $${Number(data.pricePaidUsd).toFixed(2)}`);
    console.log(`  purchase  : ${data.purchaseId}`);
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
    const url = `${baseUrl(g)}/api/events/listen?ns=${encodeURIComponent(opts.ns)}`;
    await streamSse(url, opts.ns);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(red(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
