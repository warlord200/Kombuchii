import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getBatch } from "@/server/actions";
import { createBatchAction } from "./actions";

const VALID_INPUT = {
  name: "From Form",
  totalVolumeL: 1.5,
  starterVolumeL: 0.3,
  startDate: "2026-08-01",
  targetPh: 3.0,
  roomOffsetC: 3.0,
  lat: 52.52,
  lon: 13.41,
  locationName: "Berlin",
};

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.prediction.deleteMany();
  await prisma.batch.deleteMany();
});

describe("createBatchAction", () => {
  it("creates a batch and returns its id for redirect", async () => {
    const result = await createBatchAction(VALID_INPUT);
    expect(typeof result.id).toBe("string");

    const batch = await getBatch(result.id);
    expect(batch).not.toBeNull();
    expect(batch!.name).toBe("From Form");
  });
});
