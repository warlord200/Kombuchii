import { NextResponse } from "next/server";
import { buildWeatherUrl, parseDailyTemps } from "@/lib/weather";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const pastDays = Number(searchParams.get("pastDays") ?? 0);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(pastDays) || pastDays < 0) {
    return NextResponse.json({ error: "lat, lon, and pastDays are required" }, { status: 400 });
  }

  const response = await fetch(buildWeatherUrl(lat, lon, pastDays));
  if (!response.ok) {
    return NextResponse.json({ error: "Open-Meteo request failed" }, { status: response.status });
  }

  const json: unknown = await response.json();
  return NextResponse.json(parseDailyTemps(json, pastDays));
}
