# Kombucha Tracker (Kombuchii) Implementation Plan

**Goal:** A Next.js web app that predicts F1/F2 completion windows for kombucha batches, recomputing hourly from live weather so cold fronts stretch the curve instead of a static countdown.

**Architecture:** Full-stack Next.js App Router + SQLite (Prisma) for per-batch records, self-hosted. A pure, unit-tested TypeScript model module owns all prediction math (Arrhenius rate, starter factor, daily integration, window, mold risk). Weather flows through server-side route handlers proxying Open-Meteo — keyless, CORS-free, and with `past_days` so actual temperatures for days already elapsed replace forecasts (this is what makes day-3 cold fronts real). Three scenario cards per batch (chosen / safest / most-yield). A **refresh job** — `node-cron` started by `instrumentation.ts` — fetches weather, recomputes predictions, and upserts one **prediction snapshot** per batch hourly; pages read the snapshot and only recompute when it's missing or stale.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, Prisma + SQLite, Vitest, node-cron, Open-Meteo (forecast + geocoding).

## Global Constraints

- Model module is pure: no `Date.now()`, no `fetch`, no side effects — all inputs passed in. Deterministic tests.
- All model constants (Ea, ref temp, target-pH map, safe-floor anchor points, window band) live in one `src/model/constants.ts` export, no magic numbers scattered.
- Room temp = outdoor temp − roomOffsetC (a per-batch constant, hardcoded default 3.0).
- F2 = F1 predicted date + 2 days, fixed.
- Starter floor 10%; safe floor scales with temperature.
- Everything in °C, liters, ISO dates (YYYY-MM-DD), plain Float for volumes.
- Every model change ships with a failing test first (red → green → commit).
- Model module is pure (no `Date.now()`, `fetch`, or side effects); the refresh job is a thin shell that fetches weather and persists snapshots around it.
- Prediction freshness comes from the hourly refresh job, not from page load; pages read the snapshot and recompute-on-read only when missing or stale.

## Settled Model Math (constants pinned)

- Ea = 52_844 J/mol, R = 8.314, refTemp = 25°C
- `arrheniusRate(tempC) = exp(−Ea/R · (1/(tempC+273.15) − 1/298.15))` → 1.0 at 25°C, ≈2.0 at 35°C, ≈0.48 at 15°C (Q10 ≈ 2)
- `starterFactor(pct) = √(pct / 20)` — diminishing returns: 10%→0.71, 30%→1.22
- `targetUnits(pH) = clamp(20 − 4·pH, 6, 10)` — days-at-25°C-20%: pH3.0→8, 3.5→6, 2.5→10 (calibrated: 10% starter, ~28°C room, 8–9 days to pH 3.1)
- `safeFloorPct(coldestC) = clamp to [20,24], then 30 − 15·((coldestC−20)/4)` — 24°C→15%, 20°C→30%
- window band = ±3°C on every remaining forecast day → [pessimistic, optimistic] completion
- `cumulativeUnits += arrheniusRate(roomTemp(day)) · starterFactor(pct)`, F1 done when ≥ targetUnits

## File Structure

```
Kombuchii/
├── instrumentation.ts          // boot hook: starts the refresh job (node-cron)
├── prisma/schema.prisma
├── src/
│   ├── model/
│   │   ├── constants.ts
│   │   ├── model.ts            // pure prediction math
│   │   └── model.test.ts
│   ├── lib/weather.ts          // Open-Meteo fetch + parse (tested separately from fetch)
│   ├── server/actions.ts       // Batch CRUD server actions
│   ├── server/refreshJob.ts    // hourly job: weather → predictBatch → upsert snapshot
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            // dashboard: batch list
│   │   ├── batches/new/page.tsx
│   │   ├── batches/[id]/page.tsx
│   │   └── api/{weather,geocode,batches}/route.ts
│   └── components/{BatchCard,ScenarioCard,StarterSlider,BatchForm}.tsx
├── vitest.config.ts
└── docs/plans/2026-08-14-kombucha-tracker.md
```

## Tasks (each independently testable, ends with a commit)

### Task 1 — Scaffold Next.js + Prisma + Vitest

`npx create-next-app@latest .` (TS, App Router, Tailwind), `npm i prisma @prisma/client`, `npm i -D vitest`, Prisma init + `.env` with `DATABASE_URL="file:./dev.db"`. Vitest config with jsdom not needed (pure tests). One smoke test (1+1), verify `npx vitest run` and `npm run build` pass, commit.

### Task 2 — Model core: rate + starter + safe floor (TDD)

`constants.ts` with the pinned constants. `model.ts` exports:

```ts
export function arrheniusRate(tempC: number): number
export function starterFactor(starterPct: number): number
export function targetUnits(pH: number): number
export function safeFloorPct(coldestForecastC: number): number
export function roomTemp(outdoorC: number, roomOffsetC: number): number
```

Tests (write first, verify fail): `arrheniusRate(25)`≈1, `arrheniusRate(35)`≈2, `arrheniusRate(15)`<0.5, `starterFactor(10)`<`starterFactor(20)`<`starterFactor(40)`, `targetUnits(3.0)`=10, `targetUnits(2.5)`=12.5, `targetUnits(3.5)`=7.5, `safeFloorPct(24)`=15, `safeFloorPct(20)`=30, `safeFloorPct(22)`=22.5, `safeFloorPct(30)`=15 (clamped). Commit.

### Task 3 — Completion date + window (TDD)

```ts
export interface DayTemp { date: string; tempC: number }
export function completionDate(params: {
  startDate: string; days: DayTemp[]; starterPct: number;
  roomOffsetC: number; targetPh: number; tempBandC?: number;
  maxHorizonDays?: number;
}): { f1Done: string | null; f2Done: string | null;
       window: { earliest: string | null; latest: string | null } }
```

Integrates day-by-day; extends past the forecast horizon by repeating the last known temp up to `maxHorizonDays` (120); null when never reached. Deterministic fixtures: e.g. constant 25°C, 20% starter, pH 3.0 → done ≈ day 10; a cold day 3–5 (−10°C shift) must stretch the date beyond the flat 10-day case; `tempBandC`: ±3 widens the window, and a shorter remaining horizon narrows it. Commit.

### Task 4 — predictBatch: three scenarios + mold risk (TDD)

```ts
export type ScenarioLabel = 'chosen' | 'safest' | 'most-yield'
export interface BatchInput {
  totalVolumeL: number; starterVolumeL: number; startDate: string;
  roomOffsetC: number; targetPh: number; days: DayTemp[];
}
export interface Scenario { label: ScenarioLabel; starterVolumeL: number; starterPct: number;
  f1Done: string | null; f2Done: string | null; window: {earliest: string|null; latest: string|null};
  moldRisk: 'low'|'medium'|'high' }
export function predictBatch(input: BatchInput): Scenario[]
```

Safest uses `starterVolume = totalVolume · safeFloorPct(coldest)/100`; most-yield uses 10%; chosen uses the entered amount. Mold risk: high if `starterPct < safeFloorPct(coldestC)`, medium within +5pp, else low. Tests: yield ordering (most-yield has most drinkable volume = total−starter), safest date ≤ chosen for same conditions at higher starter, risk bands for a 22°C batch (safe floor 22.5%) at 15% / 22% / 30%. Commit.

### Task 5 — Weather lib + API routes (TDD on parsing)

`lib/weather.ts`:

```ts
export function parseDailyTemps(json: unknown, pastDays: number): DayTemp[]  // (max+min)/2, past→forecast order
export function buildWeatherUrl(lat, lon, pastDays): string
export function parseGeocode(json: unknown): { lat: number; lon: number; name: string } | null
export function coldestTempC(days: DayTemp[]): number
```

Unit-test parsing with frozen JSON fixtures. Routes: `api/weather?lat&lon&pastDays` → Open-Meteo `daily=temperature_2m_max,temperature_2m_min&past_days=&timezone=auto`; `api/geocode?q=` → `geocoding-api.open-meteo.com/v1/search`. Commit.

### Task 6 — Prisma schema + Batch CRUD + Prediction model (TDD on actions)

```prisma
model Batch {
  id            String   @id @default(cuid())
  name          String
  totalVolumeL  Float
  starterVolumeL Float
  startDate     DateTime
  targetPh      Float    @default(3.0)
  roomOffsetC   Float    @default(3.0)
  lat           Float?
  lon           Float?
  locationName  String?
  prediction    Prediction?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Prediction {
  id         String   @id @default(cuid())
  batch      Batch    @relation(fields: [batchId], references: [id], onDelete: Cascade)
  batchId    String   @unique
  computedAt DateTime
  days       Json     // DayTemp[] the prediction was computed from
  scenarios  Json     // Scenario[] (chosen / safest / most-yield)
  createdAt  DateTime @default(now())
}
```

`server/actions.ts`: `createBatch`, `getBatches`, `getBatch(id)`, `updateBatch(id, …)`, `deleteBatch(id)`, `getPrediction(batchId)`, `upsertPrediction(batchId, days, scenarios)` — with zod validation (name non-empty, volumes > 0, starter < total, pH 2.5–3.5, dates valid). `getBatch`/`getBatches` include the prediction. Tests hit an in-memory SQLite (`file:./test.db` via env override). `npx prisma migrate dev`. Commit.

### Task 7 — Refresh job: node-cron + snapshot upsert (TDD)

`server/refreshJob.ts`:

```ts
export function refreshBatch(batchId: string): Promise<Prediction>        // fetch weather → predictBatch → upsert
export function refreshAllBatches(): Promise<number>                      // refresh every batch with lat+lon
export function isStale(prediction: Prediction | null, maxAgeMs: number): boolean
```

`refreshBatch` fetches weather server-side (via `buildWeatherUrl`, `pastDays = daysSinceStart`), runs `predictBatch`, and `upsertPrediction`. `refreshAllBatches` skips locationless batches (returns count refreshed). `instrumentation.ts` registers a node-cron job (`REFRESH_CRON` env, default `0 * * * *`) calling `refreshAllBatches`, guarded to `NODE_ENV === 'production'` and Node runtime so dev doesn't hit Open-Meteo. Tests (write first): `refreshBatch` computes + upserts (fake weather fetcher injected), `refreshAllBatches` skips locationless, `isStale` boundaries. Commit.

### Task 8 — Dashboard (batch list)

`app/page.tsx` renders `getBatches()`, each `BatchCard` shows name, start date, the predicted F2 window from the stored snapshot (or "no prediction yet"), and last-updated time. Manual verification checklist: two seeded batches render, cold one shows later window. `npm run build` clean. Commit.

### Task 9 — New batch form

`BatchForm` + `/batches/new/page.tsx`: name, total volume (L), starter volume (L) with live starterPct readout + safe-floor hint once location is known, start date (default today), city search → `api/geocode` → lat/lon + name, target pH (2.5–3.5 slider, default 3.0), room offset (default 3.0). Creates via `createBatch`, redirects to detail. New batch shows the no-prediction state until the next refresh job or first view computes it. Manual checklist + build. Commit.

### Task 10 — Batch detail: snapshot read + live slider

`/batches/[id]/page.tsx`: loads batch + `getPrediction`; if the snapshot is missing or `isStale` (> `PREDICTION_MAX_AGE_MS`, default 2h), calls `refreshBatch` server-side first (recompute-on-read). Renders three `ScenarioCard`s (chosen/safest/most-yield) from the snapshot's scenarios, each with F1 window, F2 date, yield volume, mold-risk badge, plus "last updated". `StarterSlider` (10%–40%) edits the chosen scenario live — re-running `predictBatch` client-side with the new starter volume from the snapshot's days (no network) — plus a "Refresh prediction" button calling `refreshBatch`. Manual checklist: verify a cold forecast shifts cards right after refresh, slider moves only the chosen card, refresh updates last-updated. Build clean. Commit.

### Task 11 — Docs + polish

README (run instructions incl. `REFRESH_CRON` + refresh job, model explanation, the settled math), save this plan file, `.gitignore` confirms `dev.db` ignored, final `npx vitest run` + `npm run build` + commit.

## Self-Review Notes

- **Spec coverage:** all design-tree branches map to tasks 2–11 (rate model→2/3, three windows→4+10, safe floor scaling→2/4, pure prediction→3, weather+offset→5/10, CRUD→6, refresh job→7, snapshot reads→8/10). Reminders stay a documented future extension point — out of scope, no task.
- **Placeholder scan:** no TBD/TODO; every task lists exact files, signatures, tests.
- **Type consistency:** `DayTemp`, `Scenario`, `predictBatch` signatures used identically across Tasks 3/4/5/10.
- **Refresh path:** the same `refreshBatch` is the single code path for the hourly job, the Refresh button, and recompute-on-read — one upsert, no drift.
