# Design Decision Rationale

Design rationale to aid myself and external readers.

## Core principles (brainstorming)

- The hard part is **exactly when**. Temperature + forecast can't give an exact date.
- This is more of an **optimization problem** than a prediction one.
- Rather than a single date, we need a **window**.
- Since "finish" isn't fixed, it is also a **window**.
- Mold is **probabilistic rather than deterministic** (even a starter above 25% might still grow mold)
- Starter trade-off: keep 30% starter (safe, slower batch) OR keep 12% starter (more to drink, higher mold risk).
- Starter amount doesn't change speed that much, theres diminishing returns.
- Predictions need to **recalibrate whenever temperature changes**.

## The App

### What system do i use to calculate the model?
- Option A: Q10 / Arrhenius
- Option B: Empirical table (from homebrew literature?)

- Option A is chosen because it has quick calculations and the entire system can be tuned by changing a few parameters (Listed in technicals)
- Option B cannot calculate predictions for figures that fall between table rows, which Option A can do.

## Why did I choose web-app over standard app?
- No download needed.
- (Native apps) need to be built.
- However, less convenient from the user's point of view.
- Notification system works less well too but its out-of-scope.


### What tech stack have I decided on?

Options considered:
- **Option A**: Next.js + SQLite/Prisma + Open-Meteo + Tailwind + Vitest
- **Option B**: Python FastAPI backend + HTML/JS frontend
- **Option C**: Pure front-end (Vite + React)

- I chose option A because it has only one unified language linking server, client, and prediction model. Option B was considered because Python is my primary language, but it requires two languages (types, validation, and the prediction model can't be shared). 
- I have considered Option C as its the easiest, but there is no CRON job, which means predictions are updated to display the last time the app was opened, and only for that browser/device.

### Why SQLite over other databases
- The default would be Postgres, but it brings a server process, auth, and networking.
- Since this is self-hosted with a relatively small amount of data, SQLite it is.
- The batch is a relational store, so no document store like MongoDB.

### Why was Prisma included in the stack?
- Mainly because it has a more readable schema, and provides type safety!

## Implementation decisions

### How should the new-batch form be tested, given Vitest runs in a Node env?
- Option A: Test the whole form in a fake browser (happy-dom).
- Option B: Create a separate function and wire it up to the form component (pure).

- While option A test real user path, option B is chosen because its fast and determinisitc (the logic itself is very important!)
- Also a failure would be easier to localize.

### Where should the refresh logic live, and how is the weather fetcher injected?
- Option A: Make a new module `refresh.ts`
- Option B : Reusing `actions.ts`
- I chose to create a new module instead, one because of the SRP principle; two, because its easier to test. Option B allows me to have fewer files

### API can only forecast 7 days
- If date is in the array, then we use that day's real temperature (actuals for past days, forecast for the future).
- If date is past the last entry, then we fall back to `lastTemp`, the temperature of the final forecast day.
- The brewer is expected to check once in awhile anyways, which then updates the prediction, so i think this works


## Architecture decisions

### How do pages get their predictions?

Options considered:
- **Option A**: Recompute on every page load (call Open-Meteo each time)
- **Option B**: Compute once, store the snapshot in the DB, serve it from there, and only recompute when its older than an hour

- I chose option B because pages load fast and never touch the weather API on their own. The 1-hour cutoff matches the hourly job, so the two line up. Option A is always the freshest, but it means one API call per batch per visit, and if the API is down the page breaks.

### How does the hourly recompute run?

Options considered:
- **Option A**: `node-cron` inside the server process, started at boot only in production
- **Option B**: External scheduler (system cron / Vercel cron) hitting an endpoint
- **Option C**: No scheduler, just recompute when someone opens the page

- I chose option A because this is self-hosted on a machine that stays on, so the in-process job is the least amount of machinery. Option B works on serverless but needs a separate scheduler to set up. Option C is the simplest, but predictions only update when you visit,which is exactly the thing the app was built to avoid. The cadence is configurable via the `REFRESH_CRON` env var (default every hour).

### How many scenarios do I show per batch?

Options considered:
- **Option A**: One prediction, just the starter you entered
- **Option B**: Three scenarios: chosen (your starter), safest (starter at the safe floor), most-yield (10% floor)

- I chose option B because the tradeoff is visible at a glance, and it nudges you toward a sensible starter amount. Option A is the simplest UI, but it hides the tradeoff.

### How does the starter slider update the prediction?

Options considered:
- **Option A**: Send the new starter % to the server and recompute there on every move
- **Option B**: Recompute locally in the browser from the snapshot's forecast days

- I chose option B because a slider that lags is a bad slider, and the pure-model decision pays for itself here. Option A always uses server-side logic, but its a network round-trip per move. The slider runs 10–40%, which is the practical starter range.

### Why does the weather go through our own server?

Options considered:
- **Option A**: Call Open-Meteo straight from the browser
- **Option B**: Proxy it through our own route handlers (`/api/weather` and `/api/geocode`)

- I chose option B because theres no CORS, no key, and parsing and error handling live in one place. Option A is one less hop, but it has CORS issues and no central place to handle errors.

## Logic technicals (Eli5)

- To calculate temperature activty, we use Arrhenius curve, adjusting Ea. 
- To calculate mold, we find a percentage between 30%(less than 20C) and 15%(above 24C) using coldest temperature, that is safe floor, if starter is lower than safe floor by alot then risk=high, vice versa
- To calculate timing, we adjust TARGET_UNITS slope and intercept
- Every prediction does a day-by-day accumulation (rate × starter factor) using that day's real temp, then it runs that whole simulation three times (baseline, +3C, −3C) to produce the completion date and the window

## Logic technicals

### How the system is calibrated?
- **Temperature sensitivity**: `Ea`
- **Overall timing**: `TARGET_UNITS_INTERCEPT` and `TARGET_UNITS_SLOPE_PER_PH`.

### How temperature is measured?
- Room temperature, but for simplicity it's `outdoor − user-set offset`.
- This is the most optimal method I can think of without having a room thermometer
- Im in Malaysia so this is consistent and easy.
- We can just change the API later (to use room in the future).

### How is rate calculated?
- daily contribution = Arrhenius rate (temperature factor) x starter factor, summed day by day until the total >= targetUnits(pH)

### How the calculation is done ?
1. Each day `i` from the start date: take that day's temperature (actuals for elapsed days, forecast for the future), convert to room temp (`outdoor − offset`), compute the Arrhenius rate, multiply by the starter factor `√(pct/20)`, and add to a running total (model.ts:108-114).
2. F1 completes on the first day the running total ≥ `targetUnits`.
3. Past the forecast, the last known temperature repeats up to `maxHorizonDays = 120`.
4. The whole simulation runs **three times**:
   - nominal (band 0) → the headline `f1Done`/`f2Done`;
   - all days shifted +3 °C = `window.earliest`;
   - all days shifted −3 °C = `window.latest`.

### How mold risk is calculated
Step by step:
1. Clamp the coldest temperature into 20–24 °C, any day colder than 20 counts as 20, warmer than 24 counts as 24.
2. Compute `fraction` = how far along that 4-degree span we are: 0 at 20 °C, 1 at 24 °C, 0.5 at 22 °C, 0.75 at 23 °C.
3. Interpolate linearly downward: `30 − 15·fraction`. At 20 °C → 30%, at 24 °C → 15%, at 22 °C → 22.5%.
4. Clamp to 15–30 (defensive; redundant after step 1).

| Coldest day | fraction | safe floor |
|-------------|----------|-----------|
| ≤ 20 °C     | 0        | 30%       |
| 21 °C       | 0.25     | 26.25%    |
| 22 °C       | 0.5      | 22.5%     |
| 23 °C       | 0.75     | 18.75%    |
| ≥ 24 °C     | 1        | 15%       |

Risk tiers relative to the safe floor:
- **low**: starter ≥ safe floor (at the line or above)
- **medium**: starter in [safeFloor − 5, safeFloor)
- **high**:  starter < safeFloor − 5
