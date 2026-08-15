import { describe, expect, it } from "vitest";
import { buildWeatherUrl, parseDailyTemps, parseGeocode } from "./weather";

const forecastFixture = Object.freeze({
  latitude: 52.52,
  longitude: 13.41,
  daily: Object.freeze({
    time: Object.freeze(["2026-08-12", "2026-08-13", "2026-08-14"]),
    temperature_2m_max: Object.freeze([25.0, 27.0, 29.0]),
    temperature_2m_min: Object.freeze([15.0, 17.0, 19.0]),
  }),
});

const geocodeFixture = Object.freeze({
  results: Object.freeze([
    Object.freeze({
      name: "Berlin",
      latitude: 52.52437,
      longitude: 13.41053,
      country: "Germany",
    }),
  ]),
});

describe("parseDailyTemps", () => {
  it("maps (max+min)/2 per day, preserving past→forecast order", () => {
    const result = parseDailyTemps(forecastFixture, 1);
    expect(result).toEqual([
      { date: "2026-08-12", tempC: 20 },
      { date: "2026-08-13", tempC: 22 },
      { date: "2026-08-14", tempC: 24 },
    ]);
  });

  it("returns an empty array when the daily block is missing", () => {
    expect(parseDailyTemps({}, 1)).toEqual([]);
  });

  it("returns an empty array when time is not an array", () => {
    expect(parseDailyTemps({ daily: { time: "nope" } }, 1)).toEqual([]);
  });

  it("treats missing max/min values as 0", () => {
    const sparse = Object.freeze({
      daily: Object.freeze({
        time: Object.freeze(["2026-08-12"]),
        temperature_2m_max: undefined,
        temperature_2m_min: undefined,
      }),
    });
    expect(parseDailyTemps(sparse, 1)).toEqual([{ date: "2026-08-12", tempC: 0 }]);
  });

  it("keeps past→forecast order, bounding the past split by pastDays", () => {
    const mixed = {
      daily: {
        time: ["2026-08-11", "2026-08-12", "2026-08-13"],
        temperature_2m_max: [30, 25, 27],
        temperature_2m_min: [10, 15, 17],
      },
    };
    expect(parseDailyTemps(mixed, 2)).toEqual([
      { date: "2026-08-11", tempC: 20 },
      { date: "2026-08-12", tempC: 20 },
      { date: "2026-08-13", tempC: 22 },
    ]);
  });
});

describe("buildWeatherUrl", () => {
  it("includes lat, lon, the two daily fields, past_days, and timezone=auto", () => {
    const url = buildWeatherUrl(52.52, 13.41, 5);
    expect(url).toContain("latitude=52.52");
    expect(url).toContain("longitude=13.41");
    expect(url).toContain("daily=temperature_2m_max,temperature_2m_min");
    expect(url).toContain("past_days=5");
    expect(url).toContain("timezone=auto");
  });
});

describe("parseGeocode", () => {
  it("extracts lat, lon, and name from the first result", () => {
    expect(parseGeocode(geocodeFixture)).toEqual({
      lat: 52.52437,
      lon: 13.41053,
      name: "Berlin",
    });
  });

  it("returns null when results is missing", () => {
    expect(parseGeocode({})).toBeNull();
  });

  it("returns null when results is empty", () => {
    expect(parseGeocode({ results: [] })).toBeNull();
  });
});
