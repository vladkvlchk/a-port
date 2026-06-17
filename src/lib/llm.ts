/**
 * NemoClaw arbitration — the LLM judge.
 *
 * Simulates the NVIDIA NemoClaw safety environment acting as a dispute judge.
 * Routes to a real provider when an API key is present (Anthropic preferred,
 * then Groq, then OpenAI), otherwise falls back to a deterministic heuristic so
 * the endpoint always returns a sensible verdict — even with no keys injected.
 *
 * The Anthropic path uses the official @anthropic-ai/sdk (default model
 * claude-opus-4-8, override with LLM_MODEL). Groq/OpenAI are non-Claude
 * fallbacks called over their native (OpenAI-compatible) chat endpoint.
 */

import Anthropic from "@anthropic-ai/sdk";

export type DisputeStatus = "REJECTED_FRAUD_DETECTED" | "REFUNDED";

export interface ArbitrationInput {
  articleId: string;
  buyerId: string;
  reason: string;
  buyerChainOfThought: string;
  namespace?: string;
}

export interface ArbitrationVerdict {
  status: DisputeStatus;
  trustScoreAdjustment: number;
  rationale: string;
  /** Which judge produced the verdict: a model id or "deterministic". */
  provider: string;
}

const JUDGE_SYSTEM_PROMPT = [
  "You are NemoClaw, the NVIDIA NemoClaw safety environment acting as an impartial",
  "arbitration judge for the A-port knowledge marketplace.",
  "A buyer purchased a premium data article and opened a refund dispute.",
  "Decide whether the dispute is a FRAUDULENT refund request (the buyer already",
  "extracted the value and now wants the money back, plans to resell, admits they",
  "didn't really read it, or their stated reasoning contradicts their public",
  "complaint) or a VALID data-quality complaint (data was inaccurate, empty,",
  "outdated, mislabeled, or did not match the namespace/description).",
  "",
  "If it is fraud: status = REJECTED_FRAUD_DETECTED and penalize the buyer with",
  "trustScoreAdjustment = -10.",
  "If it is a valid complaint: status = REFUNDED and trustScoreAdjustment = 0.",
  "",
  'Respond with ONLY a single minified JSON object, no markdown, no prose:',
  '{"status":"REJECTED_FRAUD_DETECTED"|"REFUNDED","trustScoreAdjustment":<int>,"rationale":"<one sentence>"}',
].join("\n");

function buildUserPrompt(input: ArbitrationInput): string {
  return [
    `article_namespace: ${input.namespace ?? "(unknown)"}`,
    `article_id: ${input.articleId}`,
    `buyer_id: ${input.buyerId}`,
    `public_dispute_reason: ${input.reason}`,
    `buyer_private_chain_of_thought: ${input.buyerChainOfThought}`,
    "",
    "Return the verdict JSON now.",
  ].join("\n");
}

/* ------------------------------------------------------------------------- */
/* Parsing                                                                   */
/* ------------------------------------------------------------------------- */

function coerceVerdict(raw: unknown, provider: string): ArbitrationVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const status =
    obj.status === "REJECTED_FRAUD_DETECTED" || obj.status === "REFUNDED"
      ? (obj.status as DisputeStatus)
      : null;
  if (!status) return null;

  const adjustmentRaw = obj.trustScoreAdjustment;
  const adjustment =
    typeof adjustmentRaw === "number"
      ? Math.trunc(adjustmentRaw)
      : status === "REJECTED_FRAUD_DETECTED"
        ? -10
        : 0;

  return {
    status,
    trustScoreAdjustment: adjustment,
    rationale:
      typeof obj.rationale === "string" && obj.rationale.trim()
        ? obj.rationale.trim()
        : "No rationale provided.",
    provider,
  };
}

/** Extract the first balanced JSON object from a model response. */
function parseVerdictText(text: string, provider: string): ArbitrationVerdict | null {
  const fenced = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return coerceVerdict(JSON.parse(fenced), provider);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return coerceVerdict(JSON.parse(fenced.slice(start, end + 1)), provider);
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Providers                                                                 */
/* ------------------------------------------------------------------------- */

async function judgeWithAnthropic(
  input: ArbitrationInput,
): Promise<ArbitrationVerdict | null> {
  const model = process.env.LLM_MODEL ?? "claude-opus-4-8";
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });
  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return parseVerdictText(text, model);
}

/** OpenAI-compatible chat endpoint (also used for Groq). */
async function judgeWithOpenAICompatible(
  input: ArbitrationInput,
  opts: { baseUrl: string; apiKey: string; model: string; provider: string },
): Promise<ArbitrationVerdict | null> {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 512,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`${opts.provider} HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseVerdictText(text, opts.provider);
}

/* ------------------------------------------------------------------------- */
/* Deterministic fallback                                                    */
/* ------------------------------------------------------------------------- */

const FRAUD_SIGNALS = [
  "already have",
  "already got",
  "already downloaded",
  "already used",
  "got what i needed",
  "extracted",
  "copied",
  "resell",
  "resold",
  "scrape",
  "free",
  "refund anyway",
  "just want",
  "didn't read",
  "did not read",
  "never opened",
  "charge back",
  "chargeback",
  "exploit",
];

const QUALITY_SIGNALS = [
  "inaccurate",
  "wrong",
  "incorrect",
  "outdated",
  "stale",
  "empty",
  "blank",
  "missing",
  "mislabel",
  "does not match",
  "doesn't match",
  "not as described",
  "corrupted",
  "broken",
  "duplicate",
  "low quality",
  "misleading",
];

function countSignals(haystack: string, signals: string[]): number {
  const lower = haystack.toLowerCase();
  return signals.reduce((n, s) => (lower.includes(s) ? n + 1 : n), 0);
}

function judgeDeterministically(input: ArbitrationInput): ArbitrationVerdict {
  const corpus = `${input.reason}\n${input.buyerChainOfThought}`;
  const fraud = countSignals(corpus, FRAUD_SIGNALS);
  const quality = countSignals(corpus, QUALITY_SIGNALS);

  // The chain-of-thought betraying intent the public reason hides is the
  // strongest fraud tell — weight it.
  const cotFraud = countSignals(input.buyerChainOfThought, FRAUD_SIGNALS);

  const isFraud = fraud + cotFraud > quality;

  return isFraud
    ? {
        status: "REJECTED_FRAUD_DETECTED",
        trustScoreAdjustment: -10,
        rationale: `Heuristic: ${fraud + cotFraud} fraud signal(s) vs ${quality} quality signal(s); chain-of-thought suggests value was already extracted.`,
        provider: "deterministic",
      }
    : {
        status: "REFUNDED",
        trustScoreAdjustment: 0,
        rationale: `Heuristic: ${quality} data-quality signal(s) outweigh fraud signals; treated as a good-faith complaint.`,
        provider: "deterministic",
      };
}

/* ------------------------------------------------------------------------- */
/* Public entry point                                                        */
/* ------------------------------------------------------------------------- */

export async function arbitrateDispute(
  input: ArbitrationInput,
): Promise<ArbitrationVerdict> {
  // Try providers in order; any failure falls through to the next, then to the
  // deterministic judge — the endpoint must never hard-fail on a flaky LLM.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const verdict = await judgeWithAnthropic(input);
      if (verdict) return verdict;
    } catch (err) {
      console.error("[arbitrate] anthropic failed:", err);
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const verdict = await judgeWithOpenAICompatible(input, {
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        provider: "groq",
      });
      if (verdict) return verdict;
    } catch (err) {
      console.error("[arbitrate] groq failed:", err);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const verdict = await judgeWithOpenAICompatible(input, {
        baseUrl: "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        provider: "openai",
      });
      if (verdict) return verdict;
    } catch (err) {
      console.error("[arbitrate] openai failed:", err);
    }
  }

  return judgeDeterministically(input);
}
