/**
 * The stylist's brain: Hermes via the Nous Research API (OpenAI-compatible
 * chat completions). Falls back to a simple deterministic heuristic when
 * NOUS_API_KEY is unset, so the whole agent pipeline runs today and upgrades to
 * real reasoning the moment the key is added.
 *
 * Env: NOUS_API_KEY, NOUS_BASE_URL (default Nous inference), HERMES_MODEL.
 */

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

export async function chooseOutfit(input: OutfitInput): Promise<OutfitResult> {
  const key = process.env.NOUS_API_KEY;
  if (key) {
    try {
      return { text: await viaHermes(key, input), via: "hermes" };
    } catch (error) {
      console.error("[hermes] API failed, using heuristic:", (error as Error).message);
    }
  }
  return { text: heuristic(input), via: "heuristic" };
}

async function viaHermes(key: string, input: OutfitInput): Promise<string> {
  const base = process.env.NOUS_BASE_URL || "https://inference-api.nousresearch.com/v1";
  const model = process.env.HERMES_MODEL || "Hermes-4-405B";

  const system =
    `You are the user's personal style assistant. The user has an important business meeting TOMORROW MORNING: ${input.meeting}. ` +
    `Choose a specific outfit using ONLY items from the user's wardrobe that suits the forecast and is appropriately sharp for the meeting. ` +
    `Reply in <=300 characters of plain text for an SMS: name concrete items, then a short reason. No markdown, no preamble.`;
  const user = `Forecast:\n${input.weatherText}\n\nWardrobe (JSON):\n${JSON.stringify(input.wardrobe)}`;

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 220,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    throw new Error(`Nous API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Nous API returned no content");
  return text;
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
  const base = pick("suits") ?? pick("tops") ?? "your sharpest top";
  parts.push(base);
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
