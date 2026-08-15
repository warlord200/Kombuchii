import {
  predictChosenScenario,
  type BatchInput,
  type DayTemp,
  type Scenario,
} from "@/model/model";

export const SLIDER_MIN_PCT = 10;
export const SLIDER_MAX_PCT = 40;
export const SLIDER_DEFAULT_PCT = 20;

export type BatchParams = Omit<BatchInput, "starterVolumeL" | "days">;

export interface SnapshotView {
  days: DayTemp[];
  scenarios: Scenario[];
}

export function clampPct(value: number): number {
  return Math.min(SLIDER_MAX_PCT, Math.max(SLIDER_MIN_PCT, value));
}

export function initialStarterPct(scenarios: Scenario[]): number {
  const chosen = scenarios.find((s) => s.label === "chosen");
  return clampPct(chosen?.starterPct ?? SLIDER_DEFAULT_PCT);
}

export function starterVolumeForPct(pct: number, totalVolumeL: number): number {
  return (pct / 100) * totalVolumeL;
}

export function chosenScenarioAt(
  params: BatchParams,
  snapshot: SnapshotView,
  pct: number,
): Scenario {
  return predictChosenScenario({
    ...params,
    days: snapshot.days,
    starterVolumeL: starterVolumeForPct(pct, params.totalVolumeL),
  });
}
