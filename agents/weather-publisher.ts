/**
 * Agent #1 — "weather_california".
 * Every run: fetch the next-48h forecast (default: Santa Clara, CA — Nvidia HQ)
 * and publish it to its A-port feed as a FREE post. Subscribers (e.g. the
 * stylist agent) read it for free.
 *
 *   npx tsx agents/weather-publisher.ts            # run once
 *   npx tsx agents/weather-publisher.ts --every 360  # loop every 6h
 *
 * Setup: `aport keygen weather` (creates ~/.aport/accounts/weather.key).
 * Env: APORT_API_URL, WEATHER_ACCOUNT, WEATHER_LAT/LON/LABEL.
 */

import { AportAgent } from "./lib/aport";
import { loadEnv } from "./lib/env";
import { getForecast, type Forecast } from "./lib/weather";

loadEnv();

const ACCOUNT = process.env.WEATHER_ACCOUNT || "weather";
const LAT = Number(process.env.WEATHER_LAT || "37.37"); // Santa Clara, CA (Nvidia HQ)
const LON = Number(process.env.WEATHER_LON || "-121.97");
const LABEL = process.env.WEATHER_LABEL || "Santa Clara, CA";

function buildBody(fc: Forecast): string {
  const m = fc.tomorrowMorning;
  const morning = m
    ? `Tomorrow AM (~${m.time.slice(11, 16)}): ${m.tempC}°C, ${m.shortForecast.toLowerCase()}, rain ${m.precipPct}%.`
    : "Tomorrow AM: n/a.";
  const sample = fc.hours
    .filter((_, i) => i % 6 === 0)
    .map((h) => `  ${h.time.slice(5, 16).replace("T", " ")}  ${h.tempC}°C  ${h.shortForecast}  rain ${h.precipPct}%`);
  return [fc.summary, "", morning, "", "hourly (next 48h, every 6h):", ...sample, "", "— weather_california · auto · free"].join("\n");
}

async function runOnce(): Promise<void> {
  const fc = await getForecast(LAT, LON, LABEL);
  const agent = new AportAgent(ACCOUNT);
  const result = await agent.post({ title: fc.summary, body: buildBody(fc), priceUsd: 0 });
  console.log(`[weather] posted ${result.id} as ${agent.address}`);
  console.log(`          ${fc.summary}`);
}

const everyIdx = process.argv.indexOf("--every");
const everyMin = everyIdx >= 0 ? Number(process.argv[everyIdx + 1]) : 0;

runOnce().catch((error: Error) => {
  console.error("[weather] error:", error.message);
  process.exitCode = 1;
});

if (everyMin > 0) {
  console.log(`[weather] looping every ${everyMin} min`);
  setInterval(() => {
    runOnce().catch((error: Error) => console.error("[weather] error:", error.message));
  }, everyMin * 60_000);
}
