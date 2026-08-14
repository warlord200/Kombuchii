import { describe, expect, it } from "vitest";
import {
  arrheniusRate,
  completionDate,
  roomTemp,
  safeFloorPct,
  starterFactor,
  targetUnits,
  type DayTemp,
} from "./model";

const START = "2026-08-01";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeDays(tempByDay: Record<number, number>, length = 25): DayTemp[] {
  return Array.from({ length }, (_, i) => ({
    date: addDays(START, i),
    tempC: tempByDay[i] ?? 25,
  }));
}

describe("arrheniusRate", () => {
  it("is 1.0 at the reference temperature (25°C)", () => {
    expect(arrheniusRate(25)).toBeCloseTo(1.0, 5);
  });

  it("is ≈2.0 at 35°C (Q10 ≈ 2)", () => {
    expect(arrheniusRate(35)).toBeCloseTo(2.0, 1);
  });

  it("is below 0.5 at 15°C", () => {
    expect(arrheniusRate(15)).toBeLessThan(0.5);
  });
});

describe("starterFactor", () => {
  it("is monotonic in starter percentage", () => {
    expect(starterFactor(10)).toBeLessThan(starterFactor(20));
    expect(starterFactor(20)).toBeLessThan(starterFactor(40));
  });
});

describe("targetUnits", () => {
  it("maps pH 3.0 to 10 units", () => {
    expect(targetUnits(3.0)).toBe(10);
  });

  it("maps pH 2.5 to the 12.5 upper clamp", () => {
    expect(targetUnits(2.5)).toBe(12.5);
  });

  it("maps pH 3.5 to the 7.5 lower clamp", () => {
    expect(targetUnits(3.5)).toBe(7.5);
  });
});

describe("safeFloorPct", () => {
  it("is 15% at 24°C", () => {
    expect(safeFloorPct(24)).toBe(15);
  });

  it("is 30% at 20°C", () => {
    expect(safeFloorPct(20)).toBe(30);
  });

  it("interpolates to 22.5% at 22°C", () => {
    expect(safeFloorPct(22)).toBe(22.5);
  });

  it("clamps warm temperatures to 15%", () => {
    expect(safeFloorPct(30)).toBe(15);
  });
});

describe("roomTemp", () => {
  it("subtracts the room offset from the outdoor temperature", () => {
    expect(roomTemp(25, 3)).toBe(22);
  });
});

describe("completionDate", () => {
  const base = {
    startDate: START,
    starterPct: 20,
    roomOffsetC: 0,
    targetPh: 3.0,
  };

  it("reaches F1 in ~10 days at constant 25°C with 20% starter, pH 3.0", () => {
    const days = makeDays({});
    const result = completionDate({ ...base, days });
    expect(result.f1Done).toBe(addDays(START, 9));
    expect(result.f2Done).toBe(addDays(START, 11));
  });

  it("stretches F1 beyond the flat case when days 3–5 run 10°C colder", () => {
    const flat = makeDays({});
    const cold = makeDays({ 2: 15, 3: 15, 4: 15 });
    const flatResult = completionDate({ ...base, days: flat });
    const coldResult = completionDate({ ...base, days: cold });
    expect(coldResult.f1Done).not.toBeNull();
    expect(coldResult.f1Done! > flatResult.f1Done!).toBe(true);
  });

  it("accumulates rate via roomTemp(outdoor − offset)", () => {
    const days = makeDays({});
    const warmRoom = completionDate({ ...base, days, roomOffsetC: 0 });
    const coolRoom = completionDate({ ...base, days, roomOffsetC: 8 });
    expect(coolRoom.f1Done! > warmRoom.f1Done!).toBe(true);
  });

  it("extends past the forecast by repeating the last known temp", () => {
    const days = makeDays({}, 5);
    const result = completionDate({ ...base, days });
    expect(result.f1Done).toBe(addDays(START, 9));
  });

  it("returns null when never reached within maxHorizonDays", () => {
    const days = makeDays({});
    const result = completionDate({ ...base, days, maxHorizonDays: 5 });
    expect(result.f1Done).toBeNull();
    expect(result.f2Done).toBeNull();
  });
});
