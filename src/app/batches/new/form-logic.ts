import { coldestTempC, safeFloorPct } from "@/model/model";
import type { DayTemp } from "@/model/model";

export const DEFAULT_TARGET_PH = 3.0;
export const DEFAULT_ROOM_OFFSET_C = 3.0;

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

export function starterPct(totalVolumeL: number, starterVolumeL: number): number {
  if (totalVolumeL <= 0) return 0;
  return Math.round((starterVolumeL / totalVolumeL) * 1000) / 10;
}

export function safeFloorHint(days: DayTemp[]): number | null {
  if (days.length === 0) return null;
  return safeFloorPct(coldestTempC(days));
}

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
