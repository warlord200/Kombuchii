// Refresh job: fetches weather for every located batch, recomputes predictions
// through the pure model, and stores one prediction snapshot per batch. This is
// the single code path behind three triggers:
//   1. the hourly node-cron job (started by instrumentation.ts),
//   2. the manual "Refresh prediction" button,
//   3. recompute-on-read when a snapshot is stale.
// The weather fetch is injectable so tests can run the whole flow offline.

import { schedule } from "node-cron";
import type { ScheduledTask } from "node-cron";
import { predictBatch } from "../model/model";
import { getBatch, getBatches, toIsoString, upsertPrediction } from "./actions";
import { buildWeatherUrl, parseDailyTemps } from "@/lib/weather";
import type { DayTemp } from "../model/model";

/** Default refresh cadence: every hour on the hour. Override with REFRESH_CRON. */
export const DEFAULT_REFRESH_CRON = "0 * * * *";
/** A snapshot older than this is considered stale and recomputed on read. */
export const SNAPSHOT_MAX_AGE_MS = 3_600_000;

/** Fetcher signature so tests can substitute a fake for the real HTTP call. */
export type WeatherFetcher = (lat: number, lon: number, pastDays: number) => Promise<DayTemp[]>;

/** Real weather fetcher: calls the Open-Meteo forecast API and parses it. */
export async function openMeteoFetcher(lat: number, lon: number, pastDays: number): Promise<DayTemp[]> {
  const response = await fetch(buildWeatherUrl(lat, lon, pastDays));
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: ${response.status}`);
  }
  return parseDailyTemps(await response.json(), pastDays);
}

/**
 * True when the snapshot is missing or its computedAt is older than maxAgeMs.
 * Used to decide whether a stored snapshot is still fresh enough to serve.
 */
export function isStale(
  prediction: { computedAt: Date } | null,
  maxAgeMs: number,
  now: number = Date.now(),
): boolean {
  if (prediction === null) return true;
  return now - prediction.computedAt.getTime() >= maxAgeMs;
}

/**
 * Whole days elapsed since the batch's start date (never negative). This is the
 * `past_days` value passed to Open-Meteo so already-elapsed days use actual
 * temperatures instead of forecasts.
 */
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

/**
 * Refreshes one batch's prediction snapshot: fetch weather → predictBatch →
 * upsert. Returns the new snapshot, or null when the batch has no coordinates
 * (a locationless batch cannot be predicted) or no longer exists.
 */
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

/**
 * Refreshes every batch that has coordinates. One batch failing (e.g. a bad
 * weather response) must not abort the others, so failures are swallowed and
 * the count of successfully refreshed batches is returned.
 */
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

/**
 * Starts the hourly node-cron job. The cadence comes from the REFRESH_CRON
 * environment variable (a standard cron expression), defaulting to hourly.
 */
export function startRefreshJob(): ScheduledTask {
  const expression = process.env.REFRESH_CRON ?? DEFAULT_REFRESH_CRON;
  return schedule(expression, () => {
    void refreshAllBatches();
  });
}
