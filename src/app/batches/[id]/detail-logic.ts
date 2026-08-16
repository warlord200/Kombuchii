// Client-side detail logic: deriving live scenario data from the stored
// prediction snapshot. The batch detail page reuses the snapshot's forecast
// days to recompute the chosen scenario in the browser as the starter slider
// moves — no network call, because the pure model runs anywhere.

import {
  predictChosenScenario,
  type BatchInput,
  type DayTemp,
  type Scenario,
} from "@/model/model";

// The starter slider's legal range and its fallback value when a batch has no
// snapshot yet.
export const SLIDER_MIN_PCT = 10;
export const SLIDER_MAX_PCT = 40;
export const SLIDER_DEFAULT_PCT = 20;

/** Batch inputs that stay fixed for the session; the slider varies the rest. */
export type BatchParams = Omit<BatchInput, "starterVolumeL" | "days">;

/** A prediction snapshot as the client stores it: days + the three scenarios. */
export interface SnapshotView {
  days: DayTemp[];
  scenarios: Scenario[];
}

/** Clamps a starter percentage into the slider's [min, max] range. */
export function clampPct(value: number): number {
  return Math.min(SLIDER_MAX_PCT, Math.max(SLIDER_MIN_PCT, value));
}

/**
 * The slider's starting position: the snapshot's chosen scenario starter %,
 * clamped to the slider range (falling back to SLIDER_DEFAULT_PCT when there
 * is no snapshot).
 */
export function initialStarterPct(scenarios: Scenario[]): number {
  const chosen = scenarios.find((s) => s.label === "chosen");
  return clampPct(chosen?.starterPct ?? SLIDER_DEFAULT_PCT);
}

/** Converts a starter percentage into liters given the batch's total volume. */
export function starterVolumeForPct(pct: number, totalVolumeL: number): number {
  return (pct / 100) * totalVolumeL;
}

/**
 * Recomputes the chosen scenario at a given starter percentage, using the
 * snapshot's forecast days and the batch's fixed parameters. Pure and local —
 * this is what makes the slider respond instantly.
 */
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
