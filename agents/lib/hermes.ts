/**
 * Hermes via the Nous Research API (OpenAI-compatible chat completions).
 * `callHermes` is the core; `hermesChat` (free-form) and `chooseOutfit`
 * (with a no-key heuristic fallback) build on it.
 *
 * Env: NOUS_API_KEY, NOUS_BASE_URL (default Nous inference), HERMES_MODEL.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Wardrobe {
  [category: string]: string[];
}

export interface OutfitInput {
  weatherText: string;
  wardrobe: Wardrobe;
  meeting: string;
}

export interface OutfitResult {
  text: string;
  via: "hermes" | "heuristic";
}

export function hermesConfigured(): boolean {
  return Boolean(process.env.NOUS_API_KEY);
}

/** Core call to the Nous API. Throws if NOUS_API_KEY is unset or the call fails. */
export async function callHermes(messages: ChatMessage[], maxTokens = 300): Promise<string> {
  const key = process.env.NOUS_API_KEY;
  if (!key) throw new Error("NOUS_API_KEY not set");
  const base = process.env.NOUS_BASE_URL || "https://inference-api.nousresearch.com/v1";
  const model = process.env.HERMES_MODEL || "Hermes-4-405B";

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 }),
  });
  if (!res.ok) {
    throw new Error(`Nous API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Nous API returned no content");
  return text;
}

/** Free-form chat turn (system + user) → reply. */
export async function hermesChat(system: string, user: string): Promise<string> {
  return callHermes(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    400,
  );
}

export async function chooseOutfit(input: OutfitInput): Promise<OutfitResult> {
  if (hermesConfigured()) {
    try {
      const system =
        `You are the user's personal style assistant. The user has an important business meeting TOMORROW MORNING: ${input.meeting}. ` +
        `Choose a specific outfit using ONLY items from the user's wardrobe that suits the forecast and is appropriately sharp for the meeting. ` +
        `Reply in <=300 characters of plain text: name concrete items, then a short reason. No markdown, no preamble.`;
      const user = `Forecast:\n${input.weatherText}\n\nWardrobe (JSON):\n${JSON.stringify(input.wardrobe)}`;
      const text = await callHermes(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        220,
      );
      return { text, via: "hermes" };
    } catch (error) {
      console.error("[hermes] API failed, using heuristic:", (error as Error).message);
    }
  }
  return { text: heuristic(input), via: "heuristic" };
}

/** No-LLM fallback: pick by temperature + rain from the forecast text. */
function heuristic(input: OutfitInput): string {
  const range = input.weatherText.match(/(-?\d+)–(-?\d+)°C/);
  const minC = range ? Number(range[1]) : 15;
  const rainMatch = /rain chance up to (\d+)%/.exec(input.weatherText);
  const rainPct = rainMatch ? Number(rainMatch[1]) : 0;

  const w = input.wardrobe;
  const pick = (cat: string): string | null => w[cat]?.[0] ?? null;

  const parts: string[] = [];
  parts.push(pick("suits") ?? pick("tops") ?? "your sharpest top");
  if (minC < 12) {
    const layer = pick("outerwear") ?? pick("knitwear");
    if (layer) parts.push(`+ ${layer}`);
  }
  if (rainPct >= 40) {
    const rain = pick("rain") ?? pick("outerwear");
    if (rain) parts.push(`(rain ${rainPct}% → ${rain})`);
  }
  const shoes = pick("shoes");
  if (shoes) parts.push(shoes);

  const conditions = `${minC}°C${rainPct >= 40 ? `, ${rainPct}% rain` : ""}`;
  return `Morning! Big Nvidia meeting today. Wear: ${parts.filter(Boolean).join(", ")}. ${conditions}.`;
}
