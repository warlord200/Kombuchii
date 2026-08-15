import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { prisma } from "@/server/db";
import { createBatch, getPrediction, upsertPrediction } from "@/server/actions";
import { predictBatch, type DayTemp } from "@/model/model";
import Home from "./page";

const START = "2026-08-01";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeDays(tempC: number): DayTemp[] {
  return Array.from({ length: 25 }, (_, i) => ({ date: addDays(START, i), tempC }));
}

const WARM_DAYS = makeDays(28);
const COLD_DAYS = makeDays(10);

function batchInput(name: string) {
  return {
    name,
    totalVolumeL: 1.5,
    starterVolumeL: 0.3,
    startDate: START,
    targetPh: 3.0,
    roomOffsetC: 3.0,
    lat: 52.52,
    lon: 13.41,
    locationName: "Berlin",
  };
}

async function renderHome(): Promise<string> {
  const stream = await renderToReadableStream(createElement(Home));
  return await new Response(stream).text();
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.prediction.deleteMany();
  await prisma.batch.deleteMany();
});

describe("dashboard", () => {
  it("renders two seeded batches as cards with their names", async () => {
    await createBatch(batchInput("First Brew"));
    await createBatch(batchInput("Second Brew"));

    const html = await renderHome();

    expect(html).toContain("First Brew");
    expect(html).toContain("Second Brew");
  });

  it("shows a later completion window for a cold forecast than a warm one", async () => {
    const warm = await createBatch(batchInput("Warm Batch"));
    await upsertPrediction(
      warm.id,
      WARM_DAYS,
      predictBatch({ ...batchInput("Warm Batch"), days: WARM_DAYS }),
    );
    const cold = await createBatch(batchInput("Cold Batch"));
    await upsertPrediction(
      cold.id,
      COLD_DAYS,
      predictBatch({ ...batchInput("Cold Batch"), days: COLD_DAYS }),
    );

    const html = await renderHome();

    expect(html).toContain("2026-08-09 – 2026-08-13");
    expect(html).toContain("2026-08-11 – 2026-08-15");
    expect(html).toContain("2026-09-02 – 2026-09-14");
    expect(html).toContain("2026-09-04 – 2026-09-16");
    expect(html).toMatch(/<span[^>]*>F1<\/span>/);
    expect(html).toMatch(/<span[^>]*>F2<\/span>/);
  });

  it('shows "no prediction yet" for a batch without a snapshot', async () => {
    await createBatch(batchInput("Unpredicted"));

    const html = await renderHome();

    expect(html).toContain("Unpredicted");
    expect(html).toContain("No prediction yet");
  });

  it("links each card to its batch detail page", async () => {
    const first = await createBatch(batchInput("First Brew"));
    const second = await createBatch(batchInput("Second Brew"));

    const html = await renderHome();

    expect(html).toContain(`href="/batches/${first.id}"`);
    expect(html).toContain(`href="/batches/${second.id}"`);
  });

  it("shows the last-updated time from the snapshot on a card", async () => {
    const batch = await createBatch(batchInput("Timestamped"));
    await upsertPrediction(
      batch.id,
      WARM_DAYS,
      predictBatch({ ...batchInput("Timestamped"), days: WARM_DAYS }),
    );
    const prediction = await getPrediction(batch.id);

    const html = await renderHome();

    expect(prediction).not.toBeNull();
    expect(html).toContain(prediction!.computedAt.toLocaleString());
  });
});
