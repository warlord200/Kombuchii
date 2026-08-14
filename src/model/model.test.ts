import { describe, expect, it } from "vitest";
import { arrheniusRate, starterFactor } from "./model";

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
