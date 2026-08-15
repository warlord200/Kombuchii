import { describe, expect, it } from "vitest";
import {
  starterPct,
  safeFloorHint,
  defaultFormState,
  toBatchInput,
  DEFAULT_TARGET_PH,
  DEFAULT_ROOM_OFFSET_C,
  type BatchFormState,
} from "./form-logic";
import type { DayTemp } from "@/model/model";

const DAYS: DayTemp[] = [
  { date: "2026-08-01", tempC: 22 },
  { date: "2026-08-02", tempC: 20 },
  { date: "2026-08-03", tempC: 24 },
];

describe("starterPct", () => {
  it("computes starter as a percentage of total volume", () => {
    expect(starterPct(1.5, 0.3)).toBe(20);
  });

  it("rounds to one decimal place", () => {
    expect(starterPct(1.5, 0.4)).toBe(26.7);
  });

  it("returns 0 when the total volume is zero", () => {
    expect(starterPct(0, 0.3)).toBe(0);
  });
});

describe("safeFloorHint", () => {
  it("returns null with no weather days", () => {
    expect(safeFloorHint([])).toBeNull();
  });

  it("uses the coldest day of the range", () => {
    expect(safeFloorHint(DAYS)).toBe(30);
  });
});

describe("defaultFormState", () => {
  it("defaults start date to today, targetPh 3.0, room offset 3.0", () => {
    const state = defaultFormState();
    expect(state.startDate).toBe(new Date().toISOString().slice(0, 10));
    expect(state.targetPh).toBe(DEFAULT_TARGET_PH);
    expect(state.roomOffsetC).toBe(DEFAULT_ROOM_OFFSET_C);
    expect(state.lat).toBeNull();
    expect(state.lon).toBeNull();
    expect(state.locationName).toBeNull();
  });
});

describe("toBatchInput", () => {
  it("maps form state to the createBatch input shape", () => {
    const state: BatchFormState = {
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
    expect(toBatchInput(state)).toEqual({
      name: "First Brew",
      totalVolumeL: 1.5,
      starterVolumeL: 0.3,
      startDate: "2026-08-01",
      targetPh: 3.0,
      roomOffsetC: 3.0,
      lat: 52.52,
      lon: 13.41,
      locationName: "Berlin",
    });
  });
});
