# Kombuchii

A self-hosted kombucha batch tracker that predicts first- and second-fermentation (F1/F2) completion windows for each batch from live weather, and recalculates those predictions on a schedule rather than only on page load.

## How it works

Each batch stores its volume, starter amount, start date, target pH, room offset, and location. An hourly **refresh job** fetches actual + forecast temperatures from [Open-Meteo](https://open-meteo.com/) (no API key required) for every located batch, runs the prediction model, and upserts one **prediction snapshot** per batch. Pages read the snapshot and only recompute when it is missing or stale, so the UI always shows fresh predictions without hitting the weather API on every request.

Each batch detail page renders three **scenario** cards — **chosen** (the entered starter), **safest** (starter at the temperature-dependent safe floor), and **most-yield** (starter at the 10% floor) — showing F1/F2 completion, the completion window, yield volume, and a mold-risk badge. A slider adjusts the chosen scenario's starter live, and a "Refresh prediction" button forces a recompute.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install              # also runs prisma generate
```

The Prisma datasource is SQLite, configured via `DATABASE_URL` in `.env` (default `file:./dev.db`):

```dotenv
DATABASE_URL="file:./dev.db"
REFRESH_CRON="0 * * * *"   # optional, default is hourly
```

Create the database from the checked-in migrations:

```bash
npx prisma migrate dev
```

Run the app:

```bash
npm run dev              # development server (http://localhost:3000)
```

Production build and serve:

```bash
npm run build
npm start
```

### The refresh job and REFRESH_CRON

The refresh job is started by `src/instrumentation.ts` at boot and scheduled with `node-cron` in `src/server/refresh.ts`:

- **Schedule**: the `REFRESH_CRON` environment variable (a standard cron expression), defaulting to `0 * * * *` — every hour on the hour.
- **Guards**: it only starts when `NODE_ENV === "production"` and the runtime is Node, so `npm run dev` never hits Open-Meteo on its own.
- **What it does**: for every batch with coordinates, it fetches daily max/min temperatures (including `past_days` so days already elapsed use actual temperatures instead of forecasts), recomputes `predictBatch`, and upserts the batch's prediction snapshot.

To change the cadence in production, set `REFRESH_CRON` to your desired expression (e.g. `0 */6 * * *` for every 6 hours).

## The prediction model

The model is a pure, unit-tested TypeScript module in `src/model/` with no I/O — every input is passed in, so it is deterministic and testable. All constants live in `src/model/constants.ts`.

### The settled math

- **Arrhenius rate** (`arrheniusRate`): `exp(−Ea/R · (1/(tempC+273.15) − 1/298.15))` with `Ea = 52 844 J/mol` and `R = 8.314`. Equal to 1.0 at 25 °C, ≈ 2.0 at 35 °C, ≈ 0.48 at 15 °C (Q10 ≈ 2).
- **Starter factor** (`starterFactor`): `√(pct/20)` — diminishing returns; 10% → 0.71, 30% → 1.22.
- **Target units** (`targetUnits`): `clamp(20 − 4·pH, 6, 10)` — days-at-25°C-20% equivalents; pH 3.0 → 8, pH 3.5 → 6, pH 2.5 → 10. Calibrated against a real 10%-starter batch fermenting at ~28 °C room temperature in 8–9 days (pH 3.1).
- **Safe floor** (`safeFloorPct`): the minimum starter percentage to keep mold risk low, scaling with the coldest forecast temperature: clamp coldest to [20, 24] °C, then `30 − 15·((coldestC − 20)/4)`. 24 °C → 15%, 20 °C → 30%.
- **Room temperature**: `outdoorC − roomOffsetC` (per-batch offset, default 3.0).
- **Daily integration**: `cumulative += arrheniusRate(roomTemp(day)) · starterFactor(pct)`, starting from `startDate`; F1 is done on the first day the cumulative total reaches `targetUnits(pH)`.
- **F2**: fixed at F1's completion date + 2 days.
- **Completion window**: every temperature day (past actuals and forecast alike) is run at ±3 °C (`tempBandC`) to produce optimistic (earliest) and pessimistic (latest) completion dates.
- **Horizon**: past the forecast, the last known temperature repeats for up to `maxHorizonDays` (120); a batch that never finishes returns `null`.
- **Mold risk**: `high` when starter% is more than 5 points below the safe floor, `medium` when below it, otherwise `low`.
- **Scenarios**: chosen uses the entered starter; safest uses `totalVolume · safeFloorPct/100`; most-yield uses 10% of total volume.

## Data model

Prisma + SQLite, defined in `prisma/schema.prisma`:

- **Batch** — `name`, `totalVolumeL`, `starterVolumeL`, `startDate`, `targetPh` (2.5–3.5), `roomOffsetC`, `lat`/`lon`, `locationName`.
- **Prediction** — one per batch (`batchId` unique), with `computedAt`, the `DayTemp[]` it was computed from, and the `Scenario[]` (chosen / safest / most-yield).

## Development

```bash
npm test                 # npx vitest run — full test suite (uses test.db)
npm run lint             # eslint
npm run build            # production build
```

Tests use an isolated `test.db` (auto-created via `prisma db push` in the vitest global setup); both `dev.db` and `test.db` are git-ignored.

See `docs/plans/2026-08-14-kombucha-tracker.md` for the full implementation plan and `CONTEXT.md` for the domain glossary.
