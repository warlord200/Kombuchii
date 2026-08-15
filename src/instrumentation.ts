export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startRefreshJob } = await import("./server/refresh");
  startRefreshJob();
}
