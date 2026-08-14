# Kombuchii

A kombucha batch tracker that predicts first/second fermentation completion windows from live weather, recalculated on a schedule rather than only on page load.

## Language

**Batch**:
A single kombucha brew tracked through first and second fermentation.
_Avoid_: Brew, jar

**First fermentation (F1)**:
The stage where starter tea ferments into kombucha, from start date until the target acidity is reached.

**Second fermentation (F2)**:
The carbonation stage, fixed at F1 completion plus two days.

**Starter**:
Kombucha added to a batch to seed fermentation, measured as a volume and as a percentage of total volume.

**Safe floor**:
The minimum starter percentage needed at a given temperature to keep mold risk low.
_Avoid_: Minimum starter

**Scenario**:
One of three candidate fermentations for a batch — chosen (the entered starter), safest (starter at the safe floor), most-yield (starter at the 10% floor).
_Avoid_: Option, case

**Prediction**:
The computed result for a batch — F1/F2 completion dates, completion window, and mold risk — derived from weather, not fetched.
_Avoid_: Estimate, forecast (forecast is weather-only)

**Prediction snapshot**:
A stored prediction for a batch with its compute time, kept up to date by the refresh job so the app shows fresh data without recomputing.
_Avoid_: Cached prediction

**Weather data**:
Actual and forecast daily temperatures fetched from Open-Meteo; the input to a prediction. Not the prediction itself.
_Avoid_: Weather, the forecast

**Refresh job**:
The hourly background task that fetches weather, recomputes predictions for all batches, and updates their snapshots.
_Avoid_: Cron, sync

**Completion window**:
The earliest and latest predicted F2 date for a batch, given a temperature band around remaining forecast days.
