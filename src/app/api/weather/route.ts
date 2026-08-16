// Weather API route: proxies Open-Meteo's forecast into the model's DayTemp
// list. Used by the new-batch form to show the safe-floor hint for a chosen
// location before the batch is created.
import { NextResponse } from "next/server";
import { buildWeatherUrl, parseDailyTemps } from "@/lib/weather";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const pastDays = searchParams.get("pastDays");

  const latNum = lat === null ? Number.NaN : Number(lat);
  const lonNum = lon === null ? Number.NaN : Number(lon);
  const pastDaysNum = pastDays === null ? 0 : Number(pastDays);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || !Number.isInteger(pastDaysNum) || pastDaysNum < 0) {
    return NextResponse.json({ error: "lat, lon, and pastDays are required" }, { status: 400 });
  }

  const response = await fetch(buildWeatherUrl(latNum, lonNum, pastDaysNum));
  if (!response.ok) {
    return NextResponse.json({ error: "Open-Meteo request failed" }, { status: response.status });
  }

  const json: unknown = await response.json();
  return NextResponse.json(parseDailyTemps(json, pastDaysNum));
}
