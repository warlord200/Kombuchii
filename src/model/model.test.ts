import { describe, expect, it } from "vitest";
import {
  arrheniusRate,
  coldestTempC,
  completionDate,
  predictBatch,
  predictChosenScenario,
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

function makeConstantDays(tempC: number, length = 25): DayTemp[] {
  return Array.from({ length }, (_, i) => ({
    date: addDays(START, i),
    tempC,
  }));
}

function batchInputAt22(starterVolumeL: number) {
  return {
    totalVolumeL: 1,
    starterVolumeL,
    startDate: START,
    roomOffsetC: 0,
    targetPh: 3.0,
    days: makeConstantDays(22),
  };
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

describe("coldestTempC", () => {
  it("returns the coldest temperature in the range", () => {
    const days: DayTemp[] = [
      { date: addDays(START, 0), tempC: 20 },
      { date: addDays(START, 1), tempC: 15 },
      { date: addDays(START, 2), tempC: 18 },
    ];
    expect(coldestTempC(days)).toBe(15);
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

  it("applies the temperature band to widen the completion window", () => {
    const days = makeDays({});
    const result = completionDate({ ...base, days });
    expect(result.window.earliest).not.toBeNull();
    expect(result.window.latest).not.toBeNull();
    expect(result.window.earliest! < result.f1Done!).toBe(true);
    expect(result.window.latest! > result.f1Done!).toBe(true);
  });

  it("produces a zero-width window when the band is 0", () => {
    const days = makeDays({});
    const result = completionDate({ ...base, days, tempBandC: 0 });
    expect(result.window.earliest).toBe(result.f1Done);
    expect(result.window.latest).toBe(result.f1Done);
  });

  it("narrows the window with a shorter remaining horizon", () => {
    const long = completionDate({ ...base, days: makeDays({}) });
    const short = completionDate({ ...base, days: makeDays({}, 5) });
    const width = (r: ReturnType<typeof completionDate>) =>
      new Date(r.window.latest!).getTime() - new Date(r.window.earliest!).getTime();
    expect(width(short)).toBeLessThan(width(long));
  });
});

describe("predictBatch", () => {
  const input22 = batchInputAt22;

  it("returns one scenario each for chosen, safest, and most-yield", () => {
    const result = predictBatch(input22(0.15));
    expect(result.map((s) => s.label)).toEqual(["chosen", "safest", "most-yield"]);
  });

  it("sizes each scenario's starter from the entered amount, safe floor, and 10% floor", () => {
    const result = predictBatch(input22(0.15));
    expect(result[0].starterVolumeL).toBeCloseTo(0.15, 5);
    expect(result[0].starterPct).toBeCloseTo(15, 5);
    expect(result[1].starterVolumeL).toBeCloseTo(0.225, 5);
    expect(result[1].starterPct).toBeCloseTo(22.5, 5);
    expect(result[2].starterVolumeL).toBeCloseTo(0.1, 5);
    expect(result[2].starterPct).toBeCloseTo(10, 5);
  });

  it("gives most-yield the most drinkable volume (total − starter)", () => {
    const result = predictBatch(input22(0.15));
    const [chosen, safest, mostYield] = result;
    expect(chosen.drinkableVolumeL).toBeCloseTo(0.85, 5);
    expect(safest.drinkableVolumeL).toBeCloseTo(0.775, 5);
    expect(mostYield.drinkableVolumeL).toBeCloseTo(0.9, 5);
    expect(mostYield.drinkableVolumeL).toBeGreaterThan(chosen.drinkableVolumeL);
    expect(mostYield.drinkableVolumeL).toBeGreaterThan(safest.drinkableVolumeL);
  });

  it("ranks mold risk high below the safe floor, medium within 5pp, low above", () => {
    const low = predictBatch(input22(0.3));
    const medium = predictBatch(input22(0.22));
    const high = predictBatch(input22(0.15));
    expect(low[0].moldRisk).toBe("low");
    expect(medium[0].moldRisk).toBe("medium");
    expect(high[0].moldRisk).toBe("high");
  });

  it("treats the band boundaries (safeFloor − 5pp and safeFloor) as medium and low", () => {
    const atMediumFloor = predictBatch(input22(0.175));
    const atSafeFloor = predictBatch(input22(0.225));
    expect(atMediumFloor[0].moldRisk).toBe("medium");
    expect(atSafeFloor[0].moldRisk).toBe("low");
  });

  it("completes the safest scenario no later than chosen at a higher starter", () => {
    const result = predictBatch(input22(0.15));
    const [chosen, safest] = result;
    expect(safest.starterPct).toBeGreaterThan(chosen.starterPct);
    expect(safest.f1Done).not.toBeNull();
    expect(chosen.f1Done).not.toBeNull();
    expect(safest.f1Done! <= chosen.f1Done!).toBe(true);
    expect(safest.f2Done! <= chosen.f2Done!).toBe(true);
    expect(safest.window.latest! <= chosen.window.latest!).toBe(true);
  });
});

describe("predictChosenScenario", () => {
  const input22 = batchInputAt22;

  it("returns the chosen scenario for a given starter volume", () => {
    const result = predictChosenScenario(input22(0.3));
    expect(result.label).toBe("chosen");
    expect(result.starterVolumeL).toBeCloseTo(0.3, 5);
    expect(result.starterPct).toBeCloseTo(30, 5);
    expect(result.drinkableVolumeL).toBeCloseTo(0.7, 5);
  });

  it("completes no later as the starter volume increases", () => {
    const low = predictChosenScenario(input22(0.15));
    const high = predictChosenScenario(input22(0.4));
    expect(high.f1Done! <= low.f1Done!).toBe(true);
    expect(high.f2Done! <= low.f2Done!).toBe(true);
  });

  it("matches the chosen scenario produced by predictBatch", () => {
    const batchChosen = predictBatch(input22(0.15))[0];
    const direct = predictChosenScenario(input22(0.15));
    expect(direct).toEqual(batchChosen);
  });
});
