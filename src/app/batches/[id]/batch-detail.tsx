"use client";

import { useState } from "react";
import type { DayTemp, MoldRisk, Scenario } from "@/model/model";
import {
  chosenScenarioAt,
  initialStarterPct,
  SLIDER_MAX_PCT,
  SLIDER_MIN_PCT,
  type BatchParams,
} from "./detail-logic";
import { refreshPredictionAction } from "./actions";

export interface DetailPrediction {
  computedAt: string;
  days: DayTemp[];
  scenarios: Scenario[];
}

interface BatchDetailProps {
  batch: { id: string; name: string; startDate: string };
  totalVolumeL: number;
  roomOffsetC: number;
  targetPh: number;
  prediction: DetailPrediction | null;
}

const SCENARIO_TITLES: Record<string, string> = {
  chosen: "Chosen",
  safest: "Safest",
  "most-yield": "Most yield",
};

const RISK_STYLES: Record<MoldRisk, string> = {
  low: "border-green-600/40 bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200",
  medium: "border-yellow-600/40 bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200",
  high: "border-red-600/40 bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
};

function formatWindow(scenario: Scenario): string {
  if (scenario.window.earliest === null || scenario.window.latest === null) {
    return "No prediction";
  }
  return `${scenario.window.earliest} – ${scenario.window.latest}`;
}

function formatLastUpdated(computedAt: string): string {
  return new Date(computedAt).toLocaleString();
}

function ScenarioCard({ scenario, updated }: { scenario: Scenario | null; updated: string }) {
  return (
    <article className="border border-black/10 dark:border-white/10 rounded-lg p-4 flex flex-col gap-1">
      <h3 className="font-medium text-lg">
        {scenario === null ? "No prediction" : SCENARIO_TITLES[scenario.label] ?? scenario.label}
      </h3>
      {scenario === null ? (
        <p className="text-sm text-foreground/60">No prediction yet</p>
      ) : (
        <>
          <p className="text-sm text-foreground/60">
            Starter {scenario.starterPct.toFixed(1)}% ({scenario.starterVolumeL.toFixed(2)} L) · Yield{" "}
            {scenario.drinkableVolumeL.toFixed(2)} L
          </p>
          <p>
            <span className="font-medium">F1</span> {formatWindow(scenario)}
          </p>
          <p>{`F2 ${scenario.f2Done ?? "No prediction"}`}</p>
          <p>
            <span className={`w-fit rounded-full border px-2 py-0.5 text-xs ${RISK_STYLES[scenario.moldRisk]}`}>
              {`Mold risk: ${scenario.moldRisk}`}
            </span>
          </p>
        </>
      )}
      <p className="text-xs text-foreground/50">Last updated {updated}</p>
    </article>
  );
}

export function BatchDetail({
  batch,
  totalVolumeL,
  roomOffsetC,
  targetPh,
  prediction,
}: BatchDetailProps) {
  const [snapshot, setSnapshot] = useState<DetailPrediction | null>(prediction);
  const [sliderPct, setSliderPct] = useState(() => initialStarterPct(prediction?.scenarios ?? []));
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  const params: BatchParams = { totalVolumeL, startDate: batch.startDate, roomOffsetC, targetPh };

  const chosen = snapshot === null ? null : chosenScenarioAt(params, snapshot, sliderPct);

  function scenarioFor(label: "chosen" | "safest" | "most-yield"): Scenario | null {
    if (label === "chosen") return chosen;
    return snapshot?.scenarios.find((s) => s.label === label) ?? null;
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(false);
    try {
      const next = await refreshPredictionAction(batch.id);
      if (next !== null) {
        setSnapshot(next);
      } else {
        setRefreshError(true);
      }
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground/60">Started {batch.startDate}</p>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <label className="flex items-center gap-2">
          Chosen starter: {sliderPct}%
          <input
            type="range"
            min={SLIDER_MIN_PCT}
            max={SLIDER_MAX_PCT}
            step={1}
            value={sliderPct}
            onChange={(e) => setSliderPct(Number(e.target.value))}
            disabled={snapshot === null}
          />
        </label>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="border border-black/10 dark:border-white/10 rounded px-3 py-1"
        >
          {refreshing ? "Refreshing…" : "Refresh prediction"}
        </button>
      </div>

      {refreshError && <p className="text-red-500">Could not refresh the prediction</p>}

      {snapshot === null ? (
        <p>No prediction yet</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["chosen", "safest", "most-yield"] as const).map((label) => (
            <li key={label}>
              <ScenarioCard
                scenario={scenarioFor(label)}
                updated={formatLastUpdated(snapshot.computedAt)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
