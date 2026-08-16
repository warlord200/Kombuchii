// Server actions exposed to the client batch-detail component. Wrappers around
// the server layer that strip Prisma's Date/JSON types down to plain
// serializable values the client component can store in React state.
"use server";

import { deleteBatch } from "@/server/actions";
import { refreshBatch } from "@/server/refresh";
import type { DayTemp, Scenario } from "@/model/model";

/** Forces a recompute of the batch's prediction; returns a serializable snapshot. */
export async function refreshPredictionAction(batchId: string) {
  const prediction = await refreshBatch(batchId);
  if (prediction === null) return null;
  return {
    computedAt: prediction.computedAt.toISOString(),
    days: prediction.days as unknown as DayTemp[],
    scenarios: prediction.scenarios as unknown as Scenario[],
  };
}

/** Deletes the batch; true when it existed. */
export async function deleteBatchAction(batchId: string) {
  return deleteBatch(batchId);
}
