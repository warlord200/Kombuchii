import { describe, expect, it } from "vitest";
import {
  clampPct,
  initialStarterPct,
  starterVolumeForPct,
  chosenScenarioAt,
  SLIDER_MIN_PCT,
  SLIDER_MAX_PCT,
} from "./detail-logic";
import { predictBatch, type DayTemp, type Scenario } from "@/model/model";

const START = "2026-08-01";

function makeDays(tempC: number): DayTemp[] {
  return Array.from({ length: 25 }, (_, i) => {
    const d = new Date(`${START}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), tempC };
  });
}

const PARAMS = {
  totalVolumeL: 1.5,
  startDate: START,
  roomOffsetC: 3.0,
  targetPh: 3.0,
};

const DAYS = makeDays(28);
const SCENARIOS: Scenario[] = predictBatch({
  ...PARAMS,
  starterVolumeL: 0.3,
  days: DAYS,
});

const SNAPSHOT = { days: DAYS, scenarios: SCENARIOS };

describe("clampPct", () => {
  it("passes through in-range percentages", () => {
    expect(clampPct(20)).toBe(20);
  });

  it("clamps below the minimum to 10%", () => {
    expect(clampPct(5)).toBe(SLIDER_MIN_PCT);
  });

  it("clamps above the maximum to 40%", () => {
    expect(clampPct(60)).toBe(SLIDER_MAX_PCT);
  });
});

describe("initialStarterPct", () => {
  it("uses the chosen scenario's starter percentage", () => {
    expect(initialStarterPct(SCENARIOS)).toBe(20);
  });

  it("clamps an out-of-range chosen percentage into the slider band", () => {
    const outOfRange = SCENARIOS.map((s) =>
      s.label === "chosen" ? { ...s, starterPct: 55 } : s,
    );
    expect(initialStarterPct(outOfRange)).toBe(SLIDER_MAX_PCT);
  });

  it("defaults to 20% when no chosen scenario exists", () => {
    expect(initialStarterPct([SCENARIOS[1], SCENARIOS[2]])).toBe(20);
  });

  it("defaults to 20% when there are no scenarios", () => {
    expect(initialStarterPct([])).toBe(20);
  });
});

describe("starterVolumeForPct", () => {
  it("converts a percentage into a volume of the total", () => {
    expect(starterVolumeForPct(20, 1.5)).toBeCloseTo(0.3, 5);
  });
});

describe("chosenScenarioAt", () => {
  it("recomputes only the chosen scenario from the snapshot days", () => {
    const chosen = chosenScenarioAt(PARAMS, SNAPSHOT, 20);
    expect(chosen.label).toBe("chosen");
    expect(chosen.starterPct).toBeCloseTo(20, 5);
    expect(chosen.f1Done).not.toBeNull();
    expect(chosen.f2Done).not.toBeNull();
  });

  it("matches the stored chosen scenario when the slider equals it", () => {
    const stored = SCENARIOS.find((s) => s.label === "chosen")!;
    const recomputed = chosenScenarioAt(PARAMS, SNAPSHOT, 20);
    expect(recomputed.f1Done).toBe(stored.f1Done);
    expect(recomputed.f2Done).toBe(stored.f2Done);
    expect(recomputed.window).toEqual(stored.window);
    expect(recomputed.moldRisk).toBe(stored.moldRisk);
    expect(recomputed.starterPct).toBeCloseTo(stored.starterPct, 5);
  });

  it("completes the chosen scenario earlier at a higher starter", () => {
    const low = chosenScenarioAt(PARAMS, SNAPSHOT, 10);
    const high = chosenScenarioAt(PARAMS, SNAPSHOT, 40);
    expect(high.f1Done! <= low.f1Done!).toBe(true);
  });
});
