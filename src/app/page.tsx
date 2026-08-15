import { getBatches } from "@/server/actions";
import { BatchCard, type CardBatch, type CardPrediction } from "./batch-card";

function toCardBatch(batch: Awaited<ReturnType<typeof getBatches>>[number]): CardBatch {
  return {
    id: batch.id,
    name: batch.name,
    startDate: batch.startDate,
    prediction: batch.prediction ? (batch.prediction as unknown as CardPrediction) : null,
  };
}

export default async function Home() {
  const batches = await getBatches();
  return (
    <div className="font-sans min-h-screen p-8">
      <main className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold mb-6">Batches</h1>
        {batches.length === 0 ? (
          <p className="text-foreground/60">No batches yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {batches.map((batch) => (
              <li key={batch.id}>
                <BatchCard batch={toCardBatch(batch)} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
