// Pure fermentation prediction model. This module is deliberately free of I/O
// (no Date.now(), no fetch, no DB) so every function is deterministic and easy
// to unit test: all inputs are passed in, all outputs derive from them alone.
//
// The model estimates how many days a batch needs to finish F1 by integrating
// a daily fermentation rate day-by-day:
//
//   daily progress = arrheniusRate(roomTemp(day)) × starterFactor(starterPct)
//   F1 done on the first day cumulative progress ≥ targetUnits(target pH)
//
// Dates are handled as plain "YYYY-MM-DD" ISO strings throughout, so there is
// no timezone ambiguity between callers and the model.

import {
  ARRHENIUS_EA_J_PER_MOL,
  GAS_CONSTANT_R_J_PER_MOL_K,
  KELVIN_OFFSET,
  REFERENCE_TEMP_K,
  STARTER_FACTOR_REFERENCE_PCT,
  TARGET_UNITS_INTERCEPT,
  TARGET_UNITS_MAX,
  TARGET_UNITS_MIN,
  TARGET_UNITS_SLOPE_PER_PH,
  SAFE_FLOOR_INPUT_MAX_C,
  SAFE_FLOOR_INPUT_MIN_C,
  SAFE_FLOOR_MAX_PCT,
  SAFE_FLOOR_MIN_PCT,
  SAFE_FLOOR_SPAN_C,
  DEFAULT_TEMP_BAND_C,
  DEFAULT_MAX_HORIZON_DAYS,
  F2_OFFSET_DAYS,
  NOMINAL_TEMP_BAND_C,
  MOST_YIELD_FLOOR_PCT,
  RISK_MEDIUM_BAND_PP,
} from "./constants";

/** Converts a temperature in °C to kelvin for the Arrhenius equation. */
function kelvin(tempC: number): number {
  return tempC + KELVIN_OFFSET;
}

/**
 * Temperature multiplier for fermentation speed (Arrhenius equation).
 * Returns 1.0 at 25 °C, ~2.0 at 35 °C, ~0.48 at 15 °C (Q10 ≈ 2).
 */
export function arrheniusRate(tempC: number): number {
  const k = Math.exp(
    (-ARRHENIUS_EA_J_PER_MOL / GAS_CONSTANT_R_J_PER_MOL_K) *
      (1 / kelvin(tempC) - 1 / REFERENCE_TEMP_K),
  );
  return k;
}

/**
 * Starter percentage multiplier. Diminishing returns: 10 % → 0.71, 30 % → 1.22.
 * A batch at the reference 20 % starter has factor 1.0.
 */
export function starterFactor(starterPct: number): number {
  return Math.sqrt(starterPct / STARTER_FACTOR_REFERENCE_PCT);
}

/**
 * Cumulative fermentation progress (in "days-at-25°C-20%-starter" equivalents)
 * that must be reached for F1 to be done, mapped linearly from the target pH.
 * pH 3.0 → 8, pH 3.5 → 6, pH 2.5 → 10 (clamped to [TARGET_UNITS_MIN, MAX]).
 */
export function targetUnits(pH: number): number {
  return Math.min(
    TARGET_UNITS_MAX,
    Math.max(TARGET_UNITS_MIN, TARGET_UNITS_INTERCEPT - TARGET_UNITS_SLOPE_PER_PH * pH),
  );
}

/**
 * Minimum starter percentage (of total volume) needed to keep mold risk low at
 * a given temperature. Scales linearly with the coldest forecast temperature:
 * 24 °C → 15 %, 20 °C → 30 %. Inputs outside [20, 24] °C are clamped.
 */
export function safeFloorPct(coldestForecastC: number): number {
  const clampedC = Math.min(
    SAFE_FLOOR_INPUT_MAX_C,
    Math.max(SAFE_FLOOR_INPUT_MIN_C, coldestForecastC),
  );
  const fraction = (clampedC - SAFE_FLOOR_INPUT_MIN_C) / SAFE_FLOOR_SPAN_C;
  const pct =
    SAFE_FLOOR_MAX_PCT - (SAFE_FLOOR_MAX_PCT - SAFE_FLOOR_MIN_PCT) * fraction;
  return Math.min(SAFE_FLOOR_MAX_PCT, Math.max(SAFE_FLOOR_MIN_PCT, pct));
}

/**
 * Approximate room temperature from outdoor temperature minus the batch's
 * user-set room offset (default 3.0 °C). Fermentation happens indoors, but the
 * weather API only knows outdoor temperatures.
 */
export function roomTemp(outdoorC: number, roomOffsetC: number): number {
  return outdoorC - roomOffsetC;
}

/** The coldest of the given daily temperatures; used for the safe floor. */
export function coldestTempC(days: DayTemp[]): number {
  return Math.min(...days.map((d) => d.tempC));
}

export interface DayTemp {
  /** ISO date (YYYY-MM-DD) of the day. */
  date: string;
  /** Mean temperature for the day in °C. */
  tempC: number;
}

export interface CompletionDateParams {
  /** ISO date (YYYY-MM-DD) the batch was started; fermentation begins here. */
  startDate: string;
  /** Daily temperatures (actual days first, then forecast days). */
  days: DayTemp[];
  /** Starter as a percentage of total volume. */
  starterPct: number;
  /** Outdoor → room temperature offset in °C. */
  roomOffsetC: number;
  /** Target pH at which F1 is considered complete. */
  targetPh: number;
  /** ± temperature band in °C used to compute the optimistic/pessimistic window. */
  tempBandC?: number;
  /**
   * How many days past the forecast horizon to keep simulating using the last
   * known temperature before giving up (returns null).
   */
  maxHorizonDays?: number;
}

export interface CompletionResult {
  /** ISO date F1 completes, or null if the batch never reaches its target. */
  f1Done: string | null;
  /** ISO date F2 completes (F1 + F2_OFFSET_DAYS), or null if F1 never completes. */
  f2Done: string | null;
  /** Completion window: earliest (optimistic) and latest (pessimistic) F1 dates. */
  window: { earliest: string | null; latest: string | null };
}

/** Adds a number of days to an ISO date string, working in UTC. */
function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface SimulateParams {
  startDate: string;
  days: DayTemp[];
  starterPct: number;
  roomOffsetC: number;
  targetPh: number;
  tempBandC: number;
  maxHorizonDays: number;
}

/**
 * Integrates daily fermentation progress until it reaches the target units and
 * returns the F1 completion date (or null if the horizon runs out first).
 *
 * Each simulated day uses the recorded temperature plus `tempBandC` (so a
 * positive band — warmer — completes earlier). Past the last known forecast day
 * the final recorded temperature is repeated unchanged for the remaining
 * horizon, modeling "today's weather continues".
 */
function simulateF1At(params: SimulateParams): string | null {
  const target = targetUnits(params.targetPh);
  const factor = starterFactor(params.starterPct);
  const lastTemp = params.days.length > 0 ? params.days[params.days.length - 1].tempC : null;
  let cumulative = 0;
  for (let i = 0; i < params.maxHorizonDays; i++) {
    const date = addDaysISO(params.startDate, i);
    const day = params.days.find((d) => d.date === date);
    const outdoorC = day ? day.tempC + params.tempBandC : lastTemp;
    if (outdoorC === null) return null;
    cumulative += arrheniusRate(roomTemp(outdoorC, params.roomOffsetC)) * factor;
    if (cumulative >= target) return date;
  }
  return null;
}

/** Builds a SimulateParams for one temperature-band run of the simulation. */
function simulateParams(params: CompletionDateParams, tempBandC: number, maxHorizonDays: number): SimulateParams {
  return {
    startDate: params.startDate,
    days: params.days,
    starterPct: params.starterPct,
    roomOffsetC: params.roomOffsetC,
    targetPh: params.targetPh,
    tempBandC,
    maxHorizonDays,
  };
}

/**
 * Computes the expected F1/F2 completion dates and the optimistic/pessimistic
 * completion window for a single set of conditions.
 *
 * The nominal dates run the simulation at tempBandC = 0. The window reruns it
 * at +tempBandC (earliest) and −tempBandC (latest), so a wider band or a longer
 * remaining forecast horizon widens the window.
 */
export function completionDate(params: CompletionDateParams): CompletionResult {
  const tempBandC = params.tempBandC ?? DEFAULT_TEMP_BAND_C;
  const maxHorizonDays = params.maxHorizonDays ?? DEFAULT_MAX_HORIZON_DAYS;
  const f1Done = simulateF1At(simulateParams(params, NOMINAL_TEMP_BAND_C, maxHorizonDays));
  return {
    f1Done,
    f2Done: f1Done === null ? null : addDaysISO(f1Done, F2_OFFSET_DAYS),
    window: {
      earliest: simulateF1At(simulateParams(params, tempBandC, maxHorizonDays)),
      latest: simulateF1At(simulateParams(params, -tempBandC, maxHorizonDays)),
    },
  };
}

export type ScenarioLabel = "chosen" | "safest" | "most-yield";
export type MoldRisk = "low" | "medium" | "high";

export interface BatchInput {
  totalVolumeL: number;
  starterVolumeL: number;
  startDate: string;
  roomOffsetC: number;
  targetPh: number;
  days: DayTemp[];
}

export interface Scenario {
  label: ScenarioLabel;
  starterVolumeL: number;
  starterPct: number;
  drinkableVolumeL: number;
  f1Done: string | null;
  f2Done: string | null;
  window: { earliest: string | null; latest: string | null };
  moldRisk: MoldRisk;
}

/**
 * Classifies mold risk from how far the starter percentage is below the safe
 * floor: within RISK_MEDIUM_BAND_PP below → "medium", further → "high".
 */
function moldRisk(starterPct: number, safeFloorPctValue: number): MoldRisk {
  if (starterPct < safeFloorPctValue - RISK_MEDIUM_BAND_PP) return "high";
  if (starterPct < safeFloorPctValue) return "medium";
  return "low";
}

/**
 * Builds one scenario (a concrete candidate fermentation for the batch):
 * runs the completion simulation at the given starter volume and derives the
 * drinkable yield and mold risk from it.
 */
function buildScenario(
  input: BatchInput,
  label: ScenarioLabel,
  starterVolumeL: number,
  safeFloorPctValue: number,
): Scenario {
  const starterPct = (starterVolumeL / input.totalVolumeL) * 100;
  const completion = completionDate({
    startDate: input.startDate,
    days: input.days,
    starterPct,
    roomOffsetC: input.roomOffsetC,
    targetPh: input.targetPh,
  });
  return {
    label,
    starterVolumeL,
    starterPct,
    drinkableVolumeL: input.totalVolumeL - starterVolumeL,
    f1Done: completion.f1Done,
    f2Done: completion.f2Done,
    window: completion.window,
    moldRisk: moldRisk(starterPct, safeFloorPctValue),
  };
}

/**
 * Predicts the "chosen" scenario only — used by the client-side detail slider,
 * which recomputes just the chosen card live as the starter % changes, without
 * touching the network or the stored snapshot's other two scenarios.
 */
export function predictChosenScenario(input: BatchInput): Scenario {
  const safeFloorPctValue = safeFloorPct(coldestTempC(input.days));
  return buildScenario(input, "chosen", input.starterVolumeL, safeFloorPctValue);
}

/**
 * Predicts all three scenarios for a batch:
 * - chosen — the entered starter volume;
 * - safest — starter at the temperature-dependent safe floor (less to drink,
 *   lowest mold risk);
 * - most-yield — starter at the 10 % floor (most drinkable volume, higher risk).
 */
export function predictBatch(input: BatchInput): Scenario[] {
  const safeFloorPctValue = safeFloorPct(coldestTempC(input.days));
  return [
    buildScenario(input, "chosen", input.starterVolumeL, safeFloorPctValue),
    buildScenario(
      input,
      "safest",
      (input.totalVolumeL * safeFloorPctValue) / 100,
      safeFloorPctValue,
    ),
    buildScenario(
      input,
      "most-yield",
      (input.totalVolumeL * MOST_YIELD_FLOOR_PCT) / 100,
      safeFloorPctValue,
    ),
  ];
}
