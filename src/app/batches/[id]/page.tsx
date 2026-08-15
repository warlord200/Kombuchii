import { notFound } from "next/navigation";
import Link from "next/link";
import { BatchDetail, type DetailPrediction } from "./batch-detail";
import { loadBatchWithFreshPrediction } from "./load-batch";
import type { DayTemp, Scenario } from "@/model/model";

interface Props {
  params: Promise<{ id: string }>;
}

function toDetailPrediction(prediction: {
  computedAt: Date;
  days: unknown;
  scenarios: unknown;
}): DetailPrediction {
  return {
    computedAt: prediction.computedAt.toISOString(),
    days: prediction.days as DayTemp[],
    scenarios: prediction.scenarios as Scenario[],
  };
}

export default async function BatchDetailPage({ params }: Props) {
  const { id } = await params;
  const batch = await loadBatchWithFreshPrediction(id);
  if (batch === null) notFound();

  return (
    <div className="font-sans min-h-screen p-8">
      <main className="mx-auto max-w-3xl">
        <Link href="/" className="inline-block text-sm text-foreground/60 mb-4">
          ← Batches
        </Link>
        <h1 className="text-2xl font-semibold mb-6">{batch.name}</h1>
        <BatchDetail
          key={batch.id}
          batch={{
            id: batch.id,
            name: batch.name,
            startDate: batch.startDate.toISOString().slice(0, 10),
          }}
          totalVolumeL={batch.totalVolumeL}
          roomOffsetC={batch.roomOffsetC}
          targetPh={batch.targetPh}
          prediction={batch.prediction === null ? null : toDetailPrediction(batch.prediction)}
        />
      </main>
    </div>
  );
}
