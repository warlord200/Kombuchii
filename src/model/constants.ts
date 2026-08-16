// All calibration constants for the fermentation prediction model live here so
// the model math in model.ts contains no magic numbers. Every value is a unit
// -bearing number of the kind named in its identifier (J/mol, °C, days, %).

// Arrhenius rate factor. Ea is the activation energy for kombucha fermentation,
// R the ideal gas constant; together they define how much a temperature swing
// speeds up or slows down fermentation (Q10 ≈ 2, so ~2× per +10 °C).
export const ARRHENIUS_EA_J_PER_MOL = 52_844;
export const GAS_CONSTANT_R_J_PER_MOL_K = 8.314;
export const KELVIN_OFFSET = 273.15;
// The reference temperature at which arrheniusRate() equals exactly 1.0.
export const REFERENCE_TEMP_C = 25;
export const REFERENCE_TEMP_K = REFERENCE_TEMP_C + KELVIN_OFFSET;

// Starter factor reference point: a batch with this starter % has factor 1.0
// (i.e. its daily fermentation progress is "as fast as the temperature says").
export const STARTER_FACTOR_REFERENCE_PCT = 20;

// Target units = the cumulative "days-at-25°C-20%-starter" equivalents a batch
// must reach before F1 is done, derived from the target pH via a linear map.
export const TARGET_UNITS_MIN = 6;
export const TARGET_UNITS_MAX = 10;
export const TARGET_UNITS_SLOPE_PER_PH = 4;
export const TARGET_UNITS_INTERCEPT = 20;

// Safe floor = the minimum starter % to keep mold risk low, scaled linearly
// from the coldest forecast temperature. Anchor points: 24 °C → 15 %, 20 °C → 30 %.
export const SAFE_FLOOR_INPUT_MIN_C = 20;
export const SAFE_FLOOR_INPUT_MAX_C = 24;
export const SAFE_FLOOR_MIN_PCT = 15;
export const SAFE_FLOOR_MAX_PCT = 30;
export const SAFE_FLOOR_SPAN_C = SAFE_FLOOR_INPUT_MAX_C - SAFE_FLOOR_INPUT_MIN_C;

// The completion window is computed by rerunning every forecast day at ± this
// temperature band: +band is the optimistic (earlier) edge, −band the
// pessimistic (later) edge. NOMINAL_TEMP_BAND_C (0) yields the expected date.
export const DEFAULT_TEMP_BAND_C = 3;
export const NOMINAL_TEMP_BAND_C = 0;
// Past the last forecast day the model repeats the final temperature for up to
// this many days before giving up (returns null) on a batch that never finishes.
export const DEFAULT_MAX_HORIZON_DAYS = 120;
// F2 is fixed at F1's completion date plus this many days.
export const F2_OFFSET_DAYS = 2;

// The most-yield scenario uses this fixed floor: starter = 10 % of total volume.
export const MOST_YIELD_FLOOR_PCT = 10;
// Mold risk is "medium" when starter % is below the safe floor, "high" when it
// is more than this many percentage points below it.
export const RISK_MEDIUM_BAND_PP = 5;

