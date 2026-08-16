// Geocoding API route: proxies Open-Meteo's geocoding search so the client form
// can resolve a city name to coordinates without CORS or an API key.
import { NextResponse } from "next/server";
import { parseGeocode } from "@/lib/weather";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`,
  );
  if (!response.ok) {
    return NextResponse.json({ error: "Open-Meteo geocoding request failed" }, { status: response.status });
  }

  const json: unknown = await response.json();
  // Returns { lat, lon, name } for the first match, or null when none found.
  return NextResponse.json(parseGeocode(json));
}
