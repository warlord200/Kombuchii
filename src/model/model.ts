import {
  ARRHENIUS_EA_J_PER_MOL,
  GAS_CONSTANT_R_J_PER_MOL_K,
  REFERENCE_TEMP_K,
  STARTER_FACTOR_REFERENCE_PCT,
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
