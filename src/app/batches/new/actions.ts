// Server action backing the new-batch form: validates and creates the batch,
// returning just its id so the client can redirect to the detail page.
"use server";

import { createBatch, type CreateBatchInput } from "@/server/actions";

export async function createBatchAction(input: CreateBatchInput) {
  const batch = await createBatch(input);
  return { id: batch.id };
}
