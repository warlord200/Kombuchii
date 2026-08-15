import type { DayTemp } from "../model/model";

interface DailyTemps {
  time?: unknown;
  temperature_2m_max?: unknown;
  temperature_2m_min?: unknown;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number) : [];
}

export function parseDailyTemps(json: unknown, pastDays: number): DayTemp[] {
  const daily = (json as { daily?: DailyTemps })?.daily;
  const time = asStringArray(daily?.time);
  const max = asNumberArray(daily?.temperature_2m_max);
  const min = asNumberArray(daily?.temperature_2m_min);
  const days = time.map((date, i) => ({
    date,
    tempC: ((max[i] ?? 0) + (min[i] ?? 0)) / 2,
  }));
  const past = days.slice(0, Math.min(pastDays, days.length));
  const forecast = days.slice(past.length);
  return [...past, ...forecast];
}

export function buildWeatherUrl(lat: number, lon: number, pastDays: number): string {
  const params = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min&past_days=${pastDays}&timezone=auto`;
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function parseGeocode(json: unknown): { lat: number; lon: number; name: string } | null {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as { latitude?: unknown; longitude?: unknown; name?: unknown };
  if (typeof first?.latitude !== "number" || typeof first?.longitude !== "number") return null;
  return {
    lat: first.latitude,
    lon: first.longitude,
    name: String(first.name ?? ""),
  };
}
