"use client";

// New batch form (client component): collects the batch's details, lets the
// user search for a city (which geocodes to lat/lon and pulls a forecast to
// show the safe-floor hint), then creates the batch and redirects to its page.
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  defaultFormState,
  safeFloorHint,
  starterPct,
  toBatchInput,
  DEFAULT_ROOM_OFFSET_C,
  type BatchFormState,
} from "./form-logic";
import { createBatchAction } from "./actions";
import type { DayTemp } from "@/model/model";

export function BatchForm() {
  const router = useRouter();
  const [form, setForm] = useState<BatchFormState>(defaultFormState);
  const [cityQuery, setCityQuery] = useState("");
  // Safe-floor hint once a location's forecast has been fetched.
  const [safeFloor, setSafeFloor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live starter % readout shown under the volume fields.
  const pct = starterPct(form.totalVolumeL, form.starterVolumeL);

  function updateField<K extends keyof BatchFormState>(key: K, value: BatchFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // City search: geocode the query to lat/lon, then fetch a forecast to show
  // the safe-floor hint for that location.
  async function searchCity() {
    setError(null);
    setSafeFloor(null);
    if (cityQuery.trim() === "") return;
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(cityQuery)}`);
    if (!response.ok) {
      setError("Location lookup failed");
      return;
    }
    const location: { lat: number; lon: number; name: string } | null =
      await response.json();
    if (location === null) {
      setError("Location not found");
      return;
    }
    updateField("lat", location.lat);
    updateField("lon", location.lon);
    updateField("locationName", location.name);

    try {
      const weatherResponse = await fetch(
        `/api/weather?lat=${location.lat}&lon=${location.lon}&pastDays=0`,
      );
      if (!weatherResponse.ok) return;
      const days: DayTemp[] = await weatherResponse.json();
      setSafeFloor(safeFloorHint(days));
    } catch {
      setError("Could not load the forecast");
    }
  }

  // Submit creates the batch server-side, then navigates to its detail page.
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const { id } = await createBatchAction(toBatchInput(form));
      router.push(`/batches/${id}`);
    } catch {
      setError("Could not create the batch");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
      <label className="flex flex-col gap-1">
        Name
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          className="border border-black/10 dark:border-white/10 rounded px-2 py-1"
          required
        />
      </label>

      <div className="flex gap-4">
        <label className="flex flex-col gap-1 flex-1">
          Total volume (L)
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={form.totalVolumeL}
            onChange={(e) => updateField("totalVolumeL", Number(e.target.value))}
            className="border border-black/10 dark:border-white/10 rounded px-2 py-1"
            required
          />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          Starter volume (L)
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={form.starterVolumeL}
            onChange={(e) => updateField("starterVolumeL", Number(e.target.value))}
            className="border border-black/10 dark:border-white/10 rounded px-2 py-1"
            required
          />
        </label>
      </div>

      <p>Starter: {pct}%</p>
      {safeFloor !== null && <p>Safe floor: {safeFloor}%</p>}

      <label className="flex flex-col gap-1">
        Start date
        <input
          type="date"
          value={form.startDate}
          onChange={(e) => updateField("startDate", e.target.value)}
          className="border border-black/10 dark:border-white/10 rounded px-2 py-1"
          required
        />
      </label>

      <div className="flex gap-2">
        <input
          type="text"
          value={cityQuery}
          onChange={(e) => setCityQuery(e.target.value)}
          placeholder="Search city…"
          className="border border-black/10 dark:border-white/10 rounded px-2 py-1 flex-1"
        />
        <button
          type="button"
          onClick={searchCity}
          className="border border-black/10 dark:border-white/10 rounded px-3 py-1"
        >
          Search
        </button>
      </div>
      {form.locationName !== null && (
        <p className="text-sm text-foreground/60">Location: {form.locationName}</p>
      )}

      <label className="flex flex-col gap-1">
        Target pH: {form.targetPh}
        <input
          type="range"
          min="2.5"
          max="3.5"
          step="0.1"
          value={form.targetPh}
          onChange={(e) => updateField("targetPh", Number(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        Room offset (°C)
        <input
          type="number"
          step="0.5"
          value={form.roomOffsetC}
          onChange={(e) => updateField("roomOffsetC", Number(e.target.value))}
          className="border border-black/10 dark:border-white/10 rounded px-2 py-1"
          placeholder={String(DEFAULT_ROOM_OFFSET_C)}
        />
      </label>

      {error !== null && <p className="text-red-500">{error}</p>}

      <button
        type="submit"
        className="bg-foreground text-background rounded px-4 py-2 w-fit"
      >
        Create batch
      </button>
    </form>
  );
}
