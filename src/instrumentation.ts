// Next.js boot hook (registered automatically by the App Router). In production
// it lazily starts the hourly refresh job that keeps every batch's prediction
// snapshot fresh; in development it does nothing so `npm run dev` never hits
// the Open-Meteo API on its own.
export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startRefreshJob } = await import("./server/refresh");
  startRefreshJob();
}
