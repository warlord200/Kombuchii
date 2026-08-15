import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { prisma } from "@/server/db";
import { createBatch, getPrediction, upsertPrediction } from "@/server/actions";
import { predictBatch, type DayTemp } from "@/model/model";
import { refreshBatch } from "@/server/refresh";
import BatchDetailPage from "./page";

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

function weatherResponse(tempC: number): Response {
  const count = 150;
  const today = new Date();
  const time: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today.getTime() + i * 86_400_000);
    time.push(d.toISOString().slice(0, 10));
  }
  return new Response(
    JSON.stringify({
      daily: {
        time,
        temperature_2m_max: Array(count).fill(tempC),
        temperature_2m_min: Array(count).fill(tempC),
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function stubWeather(tempC: number) {
  vi.stubGlobal("fetch", vi.fn(async () => weatherResponse(tempC)));
}

async function renderDetail(id: string): Promise<string> {
  const stream = await renderToReadableStream(
    createElement(BatchDetailPage, { params: Promise.resolve({ id }) }),
  );
  return await new Response(stream).text();
}

function f2Date(html: string): string {
  return html.match(/F2 (\d{4}-\d{2}-\d{2})/)![1];
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.prediction.deleteMany();
  await prisma.batch.deleteMany();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch detail page", () => {
  it("renders three scenario cards from a fresh snapshot", async () => {
    const batch = await createBatch(batchInput("Detail Brew"));
    await upsertPrediction(
      batch.id,
      WARM_DAYS,
      predictBatch({ ...batchInput("Detail Brew"), days: WARM_DAYS }),
    );
    const prediction = await getPrediction(batch.id);

    const html = await renderDetail(batch.id);

    expect(html).toContain("Chosen");
    expect(html).toContain("Safest");
    expect(html).toContain("Most yield");
    expect(html).toContain("F2 2026-08-12");
    expect(html).toContain("Mold risk: low");
    expect(html).toContain("Refresh prediction");
    expect(html).toContain("Delete batch");
    expect(html).toContain(prediction!.computedAt.toLocaleString());
  });

  it("recomputes server-side before rendering when the snapshot is missing", async () => {
    const batch = await createBatch(batchInput("Unpredicted"));
    stubWeather(28);

    const html = await renderDetail(batch.id);

    expect(html).toContain("Unpredicted");
    expect(html).toContain("Chosen");
    expect(html).toContain("F2 2026-08-12");
    expect(html).not.toContain("No prediction yet");
    expect(await getPrediction(batch.id)).not.toBeNull();
  });

  it("shows later dates after a refresh with a colder forecast", async () => {
    const batch = await createBatch(batchInput("Cooling Brew"));
    await upsertPrediction(
      batch.id,
      WARM_DAYS,
      predictBatch({ ...batchInput("Cooling Brew"), days: WARM_DAYS }),
    );

    const warmHtml = await renderDetail(batch.id);
    const warmF2 = f2Date(warmHtml);

    stubWeather(10);
    await refreshBatch(batch.id);
    vi.unstubAllGlobals();

    const coldHtml = await renderDetail(batch.id);
    const coldF2 = f2Date(coldHtml);

    expect(coldF2 > warmF2).toBe(true);
  });

  it("shows the no-prediction state when a refresh cannot produce a snapshot", async () => {
    const batch = await createBatch({
      ...batchInput("Locationless"),
      lat: null,
      lon: null,
      locationName: null,
    });

    const html = await renderDetail(batch.id);

    expect(html).toContain("No prediction yet");
  });
});
