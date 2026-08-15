import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { createBatch, upsertPrediction } from "@/server/actions";
import { loadBatchWithFreshPrediction } from "./load-batch";
import { SNAPSHOT_MAX_AGE_MS } from "@/server/refresh";
import type { DayTemp, Scenario } from "@/model/model";

vi.mock("@/server/refresh", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/refresh")>();
  return { ...actual, refreshBatch: vi.fn() };
});

import { refreshBatch } from "@/server/refresh";

const mockedRefresh = vi.mocked(refreshBatch);

const VALID_INPUT = {
  name: "Detail Batch",
  totalVolumeL: 1.5,
  starterVolumeL: 0.3,
  startDate: "2026-08-01",
  targetPh: 3.0,
  roomOffsetC: 3.0,
  lat: 52.52,
  lon: 13.41,
  locationName: "Berlin",
};

const DAYS: DayTemp[] = [{ date: "2026-08-01", tempC: 25 }];
const SCENARIOS: Scenario[] = [
  {
    label: "chosen",
    starterVolumeL: 0.3,
    starterPct: 20,
    drinkableVolumeL: 1.2,
    f1Done: "2026-08-10",
    f2Done: "2026-08-12",
    window: { earliest: "2026-08-09", latest: "2026-08-13" },
    moldRisk: "low",
  },
];

const FAKE_PREDICTION = {
  id: "pred-1",
  batchId: "unused",
  computedAt: new Date("2026-08-15T10:00:00Z"),
  days: DAYS,
  scenarios: SCENARIOS,
  createdAt: new Date("2026-08-15T10:00:00Z"),
};

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.prediction.deleteMany();
  await prisma.batch.deleteMany();
  mockedRefresh.mockReset();
});

describe("loadBatchWithFreshPrediction", () => {
  it("refreshes and returns the recomputed snapshot when the snapshot is missing", async () => {
    const batch = await createBatch(VALID_INPUT);
    mockedRefresh.mockResolvedValue(FAKE_PREDICTION as never);

    const loaded = await loadBatchWithFreshPrediction(batch.id);

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedRefresh).toHaveBeenCalledWith(batch.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.prediction!.computedAt).toEqual(FAKE_PREDICTION.computedAt);
  });

  it("keeps a fresh snapshot without refreshing", async () => {
    const batch = await createBatch(VALID_INPUT);
    await upsertPrediction(batch.id, DAYS, SCENARIOS);
    mockedRefresh.mockResolvedValue(FAKE_PREDICTION as never);

    const loaded = await loadBatchWithFreshPrediction(batch.id);

    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(loaded!.prediction!.scenarios).toEqual(SCENARIOS);
  });

  it("refreshes when the snapshot is stale", async () => {
    const batch = await createBatch(VALID_INPUT);
    await upsertPrediction(batch.id, DAYS, SCENARIOS);
    await prisma.prediction.update({
      where: { batchId: batch.id },
      data: { computedAt: new Date(Date.now() - SNAPSHOT_MAX_AGE_MS) },
    });
    mockedRefresh.mockResolvedValue(FAKE_PREDICTION as never);

    const loaded = await loadBatchWithFreshPrediction(batch.id);

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(loaded!.prediction!.computedAt).toEqual(FAKE_PREDICTION.computedAt);
  });

  it("returns null for an unknown batch", async () => {
    mockedRefresh.mockResolvedValue(FAKE_PREDICTION as never);

    expect(await loadBatchWithFreshPrediction("does-not-exist")).toBeNull();
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("keeps a missing snapshot when refresh cannot recompute", async () => {
    const batch = await createBatch({ ...VALID_INPUT, lat: null, lon: null, locationName: null });
    mockedRefresh.mockResolvedValue(null);

    const loaded = await loadBatchWithFreshPrediction(batch.id);

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(loaded!.prediction).toBeNull();
  });

  it("falls back to the stored snapshot when the refresh throws", async () => {
    const batch = await createBatch(VALID_INPUT);
    await upsertPrediction(batch.id, DAYS, SCENARIOS);
    await prisma.prediction.update({
      where: { batchId: batch.id },
      data: { computedAt: new Date(Date.now() - SNAPSHOT_MAX_AGE_MS) },
    });
    mockedRefresh.mockRejectedValue(new Error("Open-Meteo down"));

    const loaded = await loadBatchWithFreshPrediction(batch.id);

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(loaded).not.toBeNull();
    expect(loaded!.prediction!.scenarios).toEqual(SCENARIOS);
  });
});
