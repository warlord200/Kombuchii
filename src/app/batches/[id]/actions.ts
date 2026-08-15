"use server";

import { refreshBatch } from "@/server/refresh";
import type { DayTemp, Scenario } from "@/model/model";

export async function refreshPredictionAction(batchId: string) {
  const prediction = await refreshBatch(batchId);
  if (prediction === null) return null;
  return {
    computedAt: prediction.computedAt.toISOString(),
    days: prediction.days as unknown as DayTemp[],
    scenarios: prediction.scenarios as unknown as Scenario[],
  };
}
