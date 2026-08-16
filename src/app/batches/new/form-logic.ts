// New batch form logic: pure helpers shared by the form. Kept free of React so
// the calculations (starter %, safe-floor hint) are trivially unit-testable.
import { coldestTempC, safeFloorPct } from "@/model/model";
import type { DayTemp } from "@/model/model";

export const DEFAULT_TARGET_PH = 3.0;
export const DEFAULT_ROOM_OFFSET_C = 3.0;

/** Client-side form state; mirrors the Batch model's editable fields. */
export interface BatchFormState {
  name: string;
  totalVolumeL: number;
  starterVolumeL: number;
  startDate: string;
  targetPh: number;
  roomOffsetC: number;
  lat: number | null;
  lon: number | null;
  locationName: string | null;
}

/** Starter as a percentage of total volume, rounded to one decimal place. */
export function starterPct(totalVolumeL: number, starterVolumeL: number): number {
  if (totalVolumeL <= 0) return 0;
  return Math.round((starterVolumeL / totalVolumeL) * 1000) / 10;
}

/**
 * The safe-floor hint shown once a location's forecast is known: the minimum
 * starter % for low mold risk at the coldest forecast temperature.
 */
export function safeFloorHint(days: DayTemp[]): number | null {
  if (days.length === 0) return null;
  return safeFloorPct(coldestTempC(days));
}

/** A blank form: today's date as start date, default pH/room offset, no location. */
export function defaultFormState(): BatchFormState {
  return {
    name: "",
    totalVolumeL: 0,
    starterVolumeL: 0,
    startDate: new Date().toISOString().slice(0, 10),
    targetPh: DEFAULT_TARGET_PH,
    roomOffsetC: DEFAULT_ROOM_OFFSET_C,
    lat: null,
    lon: null,
    locationName: null,
  };
}

/** Maps form state into the createBatch server-action input shape. */
export function toBatchInput(state: BatchFormState) {
  return {
    name: state.name,
    totalVolumeL: state.totalVolumeL,
    starterVolumeL: state.starterVolumeL,
    startDate: state.startDate,
    targetPh: state.targetPh,
    roomOffsetC: state.roomOffsetC,
    lat: state.lat,
    lon: state.lon,
    locationName: state.locationName,
  };
}
