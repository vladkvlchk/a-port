/**
 * California weather via the US National Weather Service (api.weather.gov).
 * Free, no API key. Requires a descriptive User-Agent per NWS policy.
 */

const UA = "a-port-weather-agent (https://github.com/vladkvlchk/a-port)";
const HEADERS = { "User-Agent": UA, Accept: "application/geo+json" };

export interface HourPoint {
  time: string; // ISO with the location's UTC offset, e.g. 2026-06-20T08:00:00-07:00
  tempC: number;
  shortForecast: string;
  precipPct: number;
  windMph: number;
}

export interface Forecast {
  label: string;
  hours: HourPoint[];
  summary: string;
  tomorrowMorning: HourPoint | null;
}

interface NwsPeriod {
  startTime: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  windSpeed: string;
  probabilityOfPrecipitation?: { value: number | null };
}

const fToC = (f: number): number => Math.round(((f - 32) * 5) / 9);

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`NWS ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** The hour nearest 08:00 local on the first day after today in the series. */
export function tomorrowMorning(hours: HourPoint[]): HourPoint | null {
  const today = hours[0]?.time.slice(0, 10);
  const tomorrow = hours.find((h) => h.time.slice(0, 10) !== today)?.time.slice(0, 10);
  if (!tomorrow) return null;
  const sameDay = hours.filter((h) => h.time.slice(0, 10) === tomorrow);
  const morning = sameDay.find((h) => ["07", "08", "09"].includes(h.time.slice(11, 13)));
  return morning ?? sameDay[0] ?? null;
}

export async function getForecast(lat: number, lon: number, label: string): Promise<Forecast> {
  const points = await getJson<{ properties: { forecastHourly: string } }>(
    `https://api.weather.gov/points/${lat},${lon}`,
  );
  const hourly = await getJson<{ properties: { periods: NwsPeriod[] } }>(
    points.properties.forecastHourly,
  );

  const hours: HourPoint[] = hourly.properties.periods.slice(0, 48).map((p) => ({
    time: p.startTime,
    tempC: p.temperatureUnit === "F" ? fToC(p.temperature) : p.temperature,
    shortForecast: p.shortForecast,
    precipPct: p.probabilityOfPrecipitation?.value ?? 0,
    windMph: Number(String(p.windSpeed).replace(/[^\d]/g, "")) || 0,
  }));

  const temps = hours.map((h) => h.tempC);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const maxPrecip = Math.max(...hours.map((h) => h.precipPct));
  const counts = new Map<string, number>();
  for (const h of hours) counts.set(h.shortForecast, (counts.get(h.shortForecast) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const summary = `${label} — next 48h: ${min}–${max}°C, ${common.toLowerCase()}, rain chance up to ${maxPrecip}%.`;
  return { label, hours, summary, tomorrowMorning: tomorrowMorning(hours) };
}
