"use server";

import { deleteBatch } from "@/server/actions";
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

export async function deleteBatchAction(batchId: string) {
  return deleteBatch(batchId);
}
