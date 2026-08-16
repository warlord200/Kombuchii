// Open-Meteo integration: URL building plus defensive parsing of its JSON
// responses into the model's DayTemp shape. The parsing functions are pure and
// tested in isolation from any actual network call (see weather.test.ts).

import type { DayTemp } from "../model/model";

interface DailyTemps {
  time?: unknown;
  temperature_2m_max?: unknown;
  temperature_2m_min?: unknown;
}

/** Coerces an unknown JSON value into a string array, tolerating missing data. */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Coerces an unknown JSON value into a number array, tolerating missing data. */
function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number) : [];
}

/**
 * Parses an Open-Meteo forecast response into a list of daily temperatures.
 * Each day's temperature is the mean of its recorded max and min.
 *
 * The API returns past days first (when `past_days` is requested), then
 * forecast days; that ordering is preserved so days already elapsed use actual
 * temperatures while future days use forecasts. The `pastDays` count is used to
 * split (and thereby verify) that boundary.
 */
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

/**
 * Builds the Open-Meteo forecast URL for a location, requesting daily max/min
 * temperatures plus `past_days` of history so elapsed days use actuals.
 */
export function buildWeatherUrl(lat: number, lon: number, pastDays: number): string {
  const params = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min&past_days=${pastDays}&timezone=auto`;
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/**
 * Parses an Open-Meteo geocoding response, returning the first match's
 * coordinates and display name, or null when there are no usable results.
 */
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
