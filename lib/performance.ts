const SLOW_REQUEST_MS = 500;

export async function withApiTiming<T extends Response>(route: string, handler: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const response = await handler();
    const durationMs = Date.now() - startedAt;
    response.headers.set("Server-Timing", `app;dur=${durationMs}`);
    if (durationMs >= SLOW_REQUEST_MS) {
      console.info("[api-perf]", JSON.stringify({ route, status: response.status, duration_ms: durationMs }));
    }
    return response;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (durationMs >= SLOW_REQUEST_MS) {
      console.warn("[api-perf]", JSON.stringify({ route, status: 500, duration_ms: durationMs, error: true }));
    }
    throw error;
  }
}
