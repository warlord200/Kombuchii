import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./db";
import { createBatch } from "./actions";
import { isStale, refreshAllBatches, refreshBatch, startRefreshJob } from "./refresh";
import type { DayTemp } from "../model/model";

vi.mock("node-cron", () => ({
  schedule: vi.fn(),
}));

import { schedule as cronSchedule } from "node-cron";

const VALID_INPUT = {
  name: "Refresh Batch",
  totalVolumeL: 1.5,
  starterVolumeL: 0.3,
  startDate: "2026-08-01",
  targetPh: 3.0,
  roomOffsetC: 3.0,
  lat: 52.52,
  lon: 13.41,
  locationName: "Berlin",
};

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function makeDays(...offsets: number[]): DayTemp[] {
  return offsets.map((offset) => ({ date: daysAgoISO(offset), tempC: 22 + offset }));
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.prediction.deleteMany();
  await prisma.batch.deleteMany();
  vi.clearAllMocks();
});

describe("isStale", () => {
  const NOW = 1_800_000_000_000;
  const prediction = (ageMs: number) => ({ computedAt: new Date(NOW - ageMs) });

  it("is stale when there is no snapshot", () => {
    expect(isStale(null, 3_600_000, NOW)).toBe(true);
  });

  it("is fresh when younger than maxAgeMs", () => {
    expect(isStale(prediction(3_599_999), 3_600_000, NOW)).toBe(false);
  });

  it("is stale exactly at the maxAgeMs boundary", () => {
    expect(isStale(prediction(3_600_000), 3_600_000, NOW)).toBe(true);
  });

  it("is stale when older than maxAgeMs", () => {
    expect(isStale(prediction(3_600_001), 3_600_000, NOW)).toBe(true);
  });
});

describe("refreshBatch", () => {
  it("fetches weather, recomputes predictions, and upserts a snapshot", async () => {
    const batch = await createBatch(VALID_INPUT);
    const days = makeDays(0, 1);
    const fetchWeather = vi.fn(async () => days);
    const prediction = await refreshBatch(batch.id, fetchWeather);

    expect(fetchWeather).toHaveBeenCalledWith(batch.lat, batch.lon, expect.any(Number));
    expect(prediction).not.toBeNull();
    expect(prediction!.batchId).toBe(batch.id);
    expect(prediction!.days).toEqual(days);
    expect(Array.isArray(prediction!.scenarios)).toBe(true);
    expect(prediction!.scenarios).toHaveLength(3);
  });

  it("requests weather for the days since the batch started", async () => {
    await createBatch({ ...VALID_INPUT, startDate: daysAgoISO(3) });
    const fetchWeather = vi.fn(async () => makeDays(0));
    await refreshBatch((await prisma.batch.findFirst())!.id, fetchWeather);
    expect(fetchWeather).toHaveBeenCalledWith(52.52, 13.41, 3);
  });

  it("returns null for an unknown batch", async () => {
    const fetchWeather = vi.fn();
    expect(await refreshBatch("does-not-exist", fetchWeather)).toBeNull();
    expect(fetchWeather).not.toHaveBeenCalled();
  });

  it("returns null for a batch without a location", async () => {
    const batch = await createBatch({ ...VALID_INPUT, lat: null, lon: null, locationName: null });
    const fetchWeather = vi.fn();
    expect(await refreshBatch(batch.id, fetchWeather)).toBeNull();
    expect(fetchWeather).not.toHaveBeenCalled();
  });
});

describe("refreshAllBatches", () => {
  it("refreshes every located batch and returns the count", async () => {
    const a = await createBatch(VALID_INPUT);
    const b = await createBatch({ ...VALID_INPUT, name: "Second Batch", startDate: daysAgoISO(2) });
    const fetchWeather = vi.fn(async () => makeDays(0));

    const count = await refreshAllBatches(fetchWeather);

    expect(count).toBe(2);
    expect(fetchWeather).toHaveBeenCalledTimes(2);
    expect(await prisma.prediction.findUnique({ where: { batchId: a.id } })).not.toBeNull();
    expect(await prisma.prediction.findUnique({ where: { batchId: b.id } })).not.toBeNull();
  });

  it("skips batches without a location", async () => {
    await createBatch({ ...VALID_INPUT, lat: null, lon: null, locationName: null });
    await createBatch(VALID_INPUT);
    const fetchWeather = vi.fn(async () => makeDays(0));

    const count = await refreshAllBatches(fetchWeather);

    expect(count).toBe(1);
    expect(fetchWeather).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when no batches have a location", async () => {
    await createBatch({ ...VALID_INPUT, lat: null, lon: null, locationName: null });
    expect(await refreshAllBatches(vi.fn())).toBe(0);
  });

  it("continues past a batch whose weather fetch throws", async () => {
    const good = await createBatch(VALID_INPUT);
    await createBatch({ ...VALID_INPUT, name: "Throwing", lat: 50, lon: 8 });
    const fetchWeather = vi
      .fn()
      .mockRejectedValueOnce(new Error("Open-Meteo down"))
      .mockResolvedValueOnce(makeDays(0));

    const count = await refreshAllBatches(fetchWeather);

    expect(count).toBe(1);
    expect(fetchWeather).toHaveBeenCalledTimes(2);
    expect(await prisma.prediction.findUnique({ where: { batchId: good.id } })).not.toBeNull();
  });
});

describe("startRefreshJob", () => {
  it("schedules refreshAllBatches on the default cron", () => {
    startRefreshJob();
    expect(cronSchedule).toHaveBeenCalledWith("0 * * * *", expect.any(Function));
  });

  it("uses the REFRESH_CRON environment variable when set", () => {
    vi.stubEnv("REFRESH_CRON", "*/15 * * * *");
    startRefreshJob();
    expect(cronSchedule).toHaveBeenCalledWith("*/15 * * * *", expect.any(Function));
    vi.unstubAllEnvs();
  });
});
