import { describe, expect, it } from "vitest";
import { arrheniusRate, safeFloorPct, starterFactor, targetUnits } from "./model";

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
