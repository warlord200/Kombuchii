import type { DayTemp, Scenario } from "@/model/model";
import Link from "next/link";
import { F2_OFFSET_DAYS } from "@/model/constants";

export interface CardPrediction {
  computedAt: Date;
  days: DayTemp[];
  scenarios: Scenario[];
}

export interface CardBatch {
  id: string;
  name: string;
  startDate: Date;
  prediction: CardPrediction | null;
}

function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function chosenWindow(
  prediction: CardPrediction | null,
): { earliest: string | null; latest: string | null } | null {
  if (prediction === null) return null;
  const chosen = prediction.scenarios.find((s) => s.label === "chosen");
  return chosen?.window ?? null;
}

export function completionWindowText(
  prediction: CardPrediction | null,
  offsetDays: number,
): string {
  const window = chosenWindow(prediction);
  if (window === null || window.earliest === null || window.latest === null) {
    return "No prediction yet";
  }
  const earliest = addDaysISO(window.earliest, offsetDays);
  const latest = addDaysISO(window.latest, offsetDays);
  return `${earliest} – ${latest}`;
}

export function formatLastUpdated(prediction: CardPrediction | null): string | null {
  if (prediction === null) return null;
  return prediction.computedAt.toLocaleString();
}

export function BatchCard({ batch }: { batch: CardBatch }) {
  const f1 = completionWindowText(batch.prediction, 0);
  const f2 = completionWindowText(batch.prediction, F2_OFFSET_DAYS);
  const updated = formatLastUpdated(batch.prediction);

  return (
    <Link
      href={`/batches/${batch.id}`}
      className="block border border-black/10 dark:border-white/10 rounded-lg p-4 hover:bg-foreground/[0.02]"
    >
      <h2 className="font-medium text-lg">{batch.name}</h2>
      <p className="text-sm text-foreground/60">
        Started {batch.startDate.toISOString().slice(0, 10)}
      </p>
      {f1 === "No prediction yet" ? (
        <p className="mt-2">No prediction yet</p>
      ) : (
        <p className="mt-2">
          <span className="font-medium">F1</span> {f1} ·{" "}
          <span className="font-medium">F2</span> {f2}
        </p>
      )}
      {updated !== null ? (
        <p className="text-xs text-foreground/50">Last updated {updated}</p>
      ) : (
        <p className="text-xs text-foreground/50">No snapshot yet</p>
      )}
    </Link>
  );
}
