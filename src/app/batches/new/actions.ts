"use server";

import { createBatch, type CreateBatchInput } from "@/server/actions";

export async function createBatchAction(input: CreateBatchInput) {
  const batch = await createBatch(input);
  return { id: batch.id };
}
