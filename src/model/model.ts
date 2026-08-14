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
} from "./constants";

function kelvin(tempC: number): number {
  return tempC + KELVIN_OFFSET;
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
  const pct =
    SAFE_FLOOR_MAX_PCT - (SAFE_FLOOR_MAX_PCT - SAFE_FLOOR_MIN_PCT) * fraction;
  return Math.min(SAFE_FLOOR_MAX_PCT, Math.max(SAFE_FLOOR_MIN_PCT, pct));
}

export function roomTemp(outdoorC: number, roomOffsetC: number): number {
  return outdoorC - roomOffsetC;
}

export interface DayTemp {
  date: string;
  tempC: number;
}

export interface CompletionResult {
  f1Done: string | null;
  f2Done: string | null;
  window: { earliest: string | null; latest: string | null };
}

function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function simulateF1(params: {
  startDate: string;
  days: DayTemp[];
  starterPct: number;
  roomOffsetC: number;
  targetPh: number;
  tempBandC: number;
  maxHorizonDays: number;
}): string | null {
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

export function completionDate(params: {
  startDate: string;
  days: DayTemp[];
  starterPct: number;
  roomOffsetC: number;
  targetPh: number;
  tempBandC?: number;
  maxHorizonDays?: number;
}): CompletionResult {
  const tempBandC = params.tempBandC ?? DEFAULT_TEMP_BAND_C;
  const maxHorizonDays = params.maxHorizonDays ?? DEFAULT_MAX_HORIZON_DAYS;
  const f1Done = simulateF1({ ...params, tempBandC: 0, maxHorizonDays });
  return {
    f1Done,
    f2Done: f1Done === null ? null : addDaysISO(f1Done, F2_OFFSET_DAYS),
    window: {
      earliest: simulateF1({ ...params, tempBandC, maxHorizonDays }),
      latest: simulateF1({ ...params, tempBandC: -tempBandC, maxHorizonDays }),
    },
  };
}
