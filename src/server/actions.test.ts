import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import {
  createBatch,
  deleteBatch,
  getBatch,
  getBatches,
  getPrediction,
  updateBatch,
  upsertPrediction,
} from "./actions";
import type { DayTemp, Scenario } from "../model/model";

const VALID_INPUT = {
  name: "First Brew",
  totalVolumeL: 1.5,
  starterVolumeL: 0.3,
  startDate: "2026-08-01",
  targetPh: 3.0,
  roomOffsetC: 3.0,
  lat: 52.52,
  lon: 13.41,
  locationName: "Berlin",
};

const DAYS: DayTemp[] = [
  { date: "2026-08-01", tempC: 25 },
  { date: "2026-08-02", tempC: 24 },
];

const SCENARIOS: Scenario[] = [
  {
    label: "chosen",
    starterVolumeL: 0.3,
    starterPct: 20,
    drinkableVolumeL: 1.2,
    f1Done: "2026-08-11",
    f2Done: "2026-08-13",
    window: { earliest: "2026-08-10", latest: "2026-08-14" },
    moldRisk: "low",
  },
  {
    label: "safest",
    starterVolumeL: 0.3375,
    starterPct: 22.5,
    drinkableVolumeL: 1.1625,
    f1Done: "2026-08-11",
    f2Done: "2026-08-13",
    window: { earliest: "2026-08-10", latest: "2026-08-14" },
    moldRisk: "low",
  },
  {
    label: "most-yield",
    starterVolumeL: 0.15,
    starterPct: 10,
    drinkableVolumeL: 1.35,
    f1Done: "2026-08-12",
    f2Done: "2026-08-14",
    window: { earliest: "2026-08-11", latest: "2026-08-15" },
    moldRisk: "high",
  },
];

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.prediction.deleteMany();
  await prisma.batch.deleteMany();
});

describe("createBatch", () => {
  it("persists a batch with the validated fields and defaults", async () => {
    const batch = await createBatch(VALID_INPUT);
    expect(batch.name).toBe("First Brew");
    expect(batch.totalVolumeL).toBe(1.5);
    expect(batch.starterVolumeL).toBe(0.3);
    expect(batch.startDate.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(batch.targetPh).toBe(3.0);
    expect(batch.roomOffsetC).toBe(3.0);
    expect(batch.lat).toBe(52.52);
    expect(batch.lon).toBe(13.41);
    expect(batch.locationName).toBe("Berlin");
    expect(batch.prediction).toBeNull();
  });

  it("applies defaults for targetPh and roomOffsetC when omitted", async () => {
    const batch = await createBatch({
      name: VALID_INPUT.name,
      totalVolumeL: VALID_INPUT.totalVolumeL,
      starterVolumeL: VALID_INPUT.starterVolumeL,
      startDate: VALID_INPUT.startDate,
    });
    expect(batch.targetPh).toBe(3.0);
    expect(batch.roomOffsetC).toBe(3.0);
  });

  it("rejects an empty name", async () => {
    await expect(createBatch({ ...VALID_INPUT, name: "   " })).rejects.toThrow();
  });

  it("rejects a non-positive total volume", async () => {
    await expect(createBatch({ ...VALID_INPUT, totalVolumeL: 0 })).rejects.toThrow();
  });

  it("rejects a non-positive starter volume", async () => {
    await expect(createBatch({ ...VALID_INPUT, starterVolumeL: -0.1 })).rejects.toThrow();
  });

  it("rejects starter volume >= total volume", async () => {
    await expect(
      createBatch({ ...VALID_INPUT, starterVolumeL: VALID_INPUT.totalVolumeL }),
    ).rejects.toThrow();
  });

  it("rejects a pH outside 2.5–3.5", async () => {
    await expect(createBatch({ ...VALID_INPUT, targetPh: 3.6 })).rejects.toThrow();
    await expect(createBatch({ ...VALID_INPUT, targetPh: 2.4 })).rejects.toThrow();
  });

  it("rejects an invalid start date", async () => {
    await expect(createBatch({ ...VALID_INPUT, startDate: "2026-13-01" })).rejects.toThrow();
    await expect(createBatch({ ...VALID_INPUT, startDate: "not-a-date" })).rejects.toThrow();
  });
});

describe("getBatches", () => {
  it("returns created batches including their prediction snapshot", async () => {
    const created = await createBatch(VALID_INPUT);
    await upsertPrediction(created.id, DAYS, SCENARIOS);
    const batches = await getBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0].id).toBe(created.id);
    expect(batches[0].prediction).not.toBeNull();
    expect(batches[0].prediction!.scenarios).toEqual(SCENARIOS);
  });

  it("returns an empty list when no batches exist", async () => {
    expect(await getBatches()).toEqual([]);
  });
});

describe("getBatch", () => {
  it("returns the batch by id including the prediction snapshot", async () => {
    const created = await createBatch(VALID_INPUT);
    await upsertPrediction(created.id, DAYS, SCENARIOS);
    const batch = await getBatch(created.id);
    expect(batch).not.toBeNull();
    expect(batch!.name).toBe("First Brew");
    expect(batch!.prediction!.days).toEqual(DAYS);
  });

  it("returns null for an unknown id", async () => {
    expect(await getBatch("does-not-exist")).toBeNull();
  });
});

describe("updateBatch", () => {
  it("updates the given fields and leaves the rest unchanged", async () => {
    const created = await createBatch(VALID_INPUT);
    const updated = await updateBatch(created.id, { name: "Second Batch", totalVolumeL: 2.0 });
    expect(updated!.name).toBe("Second Batch");
    expect(updated!.totalVolumeL).toBe(2.0);
    expect(updated!.starterVolumeL).toBe(0.3);
  });

  it("returns null when the batch does not exist", async () => {
    expect(await updateBatch("nope", { name: "x" })).toBeNull();
  });

  it("validates the partial input", async () => {
    const created = await createBatch(VALID_INPUT);
    await expect(updateBatch(created.id, { name: " " })).rejects.toThrow();
    await expect(updateBatch(created.id, { starterVolumeL: 5.0 })).rejects.toThrow();
  });
});

describe("deleteBatch", () => {
  it("removes the batch", async () => {
    const created = await createBatch(VALID_INPUT);
    await expect(deleteBatch(created.id)).resolves.toBe(true);
    expect(await getBatch(created.id)).toBeNull();
  });

  it("cascades the prediction snapshot", async () => {
    const created = await createBatch(VALID_INPUT);
    await upsertPrediction(created.id, DAYS, SCENARIOS);
    await deleteBatch(created.id);
    expect(await getPrediction(created.id)).toBeNull();
  });

  it("returns false for an unknown id", async () => {
    await expect(deleteBatch("missing")).resolves.toBe(false);
  });
});

describe("upsertPrediction / getPrediction", () => {
  it("creates a snapshot for a batch and reads it back", async () => {
    const created = await createBatch(VALID_INPUT);
    const prediction = await upsertPrediction(created.id, DAYS, SCENARIOS);
    expect(prediction.computedAt).toBeInstanceOf(Date);
    expect(prediction.days).toEqual(DAYS);
    expect(prediction.scenarios).toEqual(SCENARIOS);
    const read = await getPrediction(created.id);
    expect(read!.days).toEqual(DAYS);
    expect(read!.scenarios).toEqual(SCENARIOS);
  });

  it("upserts: replacing the existing snapshot for the same batch", async () => {
    const created = await createBatch(VALID_INPUT);
    await upsertPrediction(created.id, DAYS, SCENARIOS);
    const newerDays: DayTemp[] = [{ date: "2026-08-03", tempC: 26 }];
    await upsertPrediction(created.id, newerDays, SCENARIOS);
    const all = await prisma.prediction.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].days).toEqual(newerDays);
  });

  it("returns null for a batch without a snapshot", async () => {
    const created = await createBatch(VALID_INPUT);
    expect(await getPrediction(created.id)).toBeNull();
  });
});
