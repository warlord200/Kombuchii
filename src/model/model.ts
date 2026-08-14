import {
  ARRHENIUS_EA_J_PER_MOL,
  GAS_CONSTANT_R_J_PER_MOL_K,
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
} from "./constants";

function kelvin(tempC: number): number {
  return tempC + 273.15;
}

export function arrheniusRate(tempC: number): number {
  const k = Math.exp(
    (-ARRHENIUS_EA_J_PER_MOL / GAS_CONSTANT_R_J_PER_MOL_K) *
      (1 / kelvin(tempC) - 1 / REFERENCE_TEMP_K),
  );
  return k;
}

export function starterFactor(starterPct: number): number {
  return Math.sqrt(starterPct / STARTER_FACTOR_REFERENCE_PCT);
}

export function targetUnits(pH: number): number {
  return Math.min(
    TARGET_UNITS_MAX,
    Math.max(TARGET_UNITS_MIN, TARGET_UNITS_INTERCEPT - TARGET_UNITS_SLOPE_PER_PH * pH),
  );
}

export function safeFloorPct(coldestForecastC: number): number {
  const clampedC = Math.min(
    SAFE_FLOOR_INPUT_MAX_C,
    Math.max(SAFE_FLOOR_INPUT_MIN_C, coldestForecastC),
  );
  const fraction = (clampedC - SAFE_FLOOR_INPUT_MIN_C) / SAFE_FLOOR_SPAN_C;
  const pct = SAFE_FLOOR_MAX_PCT - SAFE_FLOOR_MIN_PCT * fraction;
  return Math.min(SAFE_FLOOR_MAX_PCT, Math.max(SAFE_FLOOR_MIN_PCT, pct));
}
