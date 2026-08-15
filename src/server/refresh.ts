import { schedule } from "node-cron";
import type { ScheduledTask } from "node-cron";
import { predictBatch } from "../model/model";
import { getBatch, getBatches, toIsoString, upsertPrediction } from "./actions";
import { buildWeatherUrl, parseDailyTemps } from "@/lib/weather";
import type { DayTemp } from "../model/model";

export const DEFAULT_REFRESH_CRON = "0 * * * *";

export type WeatherFetcher = (lat: number, lon: number, pastDays: number) => Promise<DayTemp[]>;

export async function openMeteoFetcher(lat: number, lon: number, pastDays: number): Promise<DayTemp[]> {
  const response = await fetch(buildWeatherUrl(lat, lon, pastDays));
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: ${response.status}`);
  }
  return parseDailyTemps(await response.json(), pastDays);
}

export function isStale(
  prediction: { computedAt: Date } | null,
  maxAgeMs: number,
  now: number = Date.now(),
): boolean {
  if (prediction === null) return true;
  return now - prediction.computedAt.getTime() >= maxAgeMs;
}

function daysSinceStart(startDate: Date): number {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const today = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  return Math.max(0, Math.round((today - start) / 86_400_000));
}

export async function refreshBatch(
  batchId: string,
  fetchWeather: WeatherFetcher = openMeteoFetcher,
) {
  const batch = await getBatch(batchId);
  if (!batch || batch.lat === null || batch.lon === null) return null;

  const pastDays = daysSinceStart(batch.startDate);
  const days = await fetchWeather(batch.lat, batch.lon, pastDays);
  const scenarios = predictBatch({
    totalVolumeL: batch.totalVolumeL,
    starterVolumeL: batch.starterVolumeL,
    startDate: toIsoString(batch.startDate),
    roomOffsetC: batch.roomOffsetC,
    targetPh: batch.targetPh,
    days,
  });

  return upsertPrediction(batchId, days, scenarios);
}

export async function refreshAllBatches(fetchWeather: WeatherFetcher = openMeteoFetcher): Promise<number> {
  const batches = await getBatches();
  let refreshed = 0;
  for (const batch of batches) {
    if (batch.lat === null || batch.lon === null) continue;
    try {
      const result = await refreshBatch(batch.id, fetchWeather);
      if (result !== null) refreshed += 1;
    } catch {
      // A failing batch must not abort the refresh of the others.
    }
  }
  return refreshed;
}

export function startRefreshJob(): ScheduledTask {
  const expression = process.env.REFRESH_CRON ?? DEFAULT_REFRESH_CRON;
  return schedule(expression, () => {
    void refreshAllBatches();
  });
}
