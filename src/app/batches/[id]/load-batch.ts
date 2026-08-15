import { getBatch } from "@/server/actions";
import { isStale, refreshBatch, SNAPSHOT_MAX_AGE_MS } from "@/server/refresh";

export async function loadBatchWithFreshPrediction(id: string) {
  const batch = await getBatch(id);
  if (batch === null) return null;

  if (isStale(batch.prediction, SNAPSHOT_MAX_AGE_MS)) {
    try {
      const refreshed = await refreshBatch(id);
      if (refreshed !== null) {
        return { ...batch, prediction: refreshed };
      }
    } catch {
      // Fall back to the stored snapshot when the refresh fails.
    }
  }

  return batch;
}
