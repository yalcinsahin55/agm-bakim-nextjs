import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const SLOW_REQUEST_MS = 500;
const SLOW_DB_OPERATION_MS = 250;
const REQUEST_ID_HEADER = "X-Request-Id";
const OBSERVABILITY_PREFIX = "[api-observability]";
const requestContext = new AsyncLocalStorage<string>();

export function getCurrentRequestId(): string | undefined {
  return requestContext.getStore();
}

type ApiRequestLike = Pick<Request, "method" | "headers">;

type ApiTimingOptions = {
  request?: ApiRequestLike;
  source?: "api" | "cron" | "internal";
  userId?: string;
  userRole?: string;
};

function createRequestId(request?: ApiRequestLike): string {
  const incoming = request?.headers.get(REQUEST_ID_HEADER)?.trim();
  if (incoming && incoming.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(incoming)) return incoming;
  return `req_${randomUUID()}`;
}

function durationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function safeIdentity(value: string | undefined): string | undefined {
  if (!value || value.length > 120 || !/^[A-Za-z0-9._:@-]+$/.test(value)) return undefined;
  return value;
}

function errorName(error: unknown): string {
  if (error instanceof Error && error.name && /^[A-Za-z0-9_.-]{1,80}$/.test(error.name)) return error.name;
  return "UnknownError";
}

function safeOperation(value: string): string {
  return value.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(value) ? value : "unknown_operation";
}

function writeLog(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>): void {
  const payload = JSON.stringify({ event, ...fields, timestamp: new Date().toISOString() });
  if (level === "error") console.error(OBSERVABILITY_PREFIX, payload);
  else if (level === "warn") console.warn(OBSERVABILITY_PREFIX, payload);
  else console.info(OBSERVABILITY_PREFIX, payload);
}

/**
 * Measures internal DB/cache work and emits only slow operations, errors, or explicitly
 * enabled request logs. Query parameters, headers, and bodies are never logged.
 */
export async function withDbTiming<T>(
  operation: string,
  handler: () => Promise<T>,
  options: { thresholdMs?: number; source?: "db" | "cache" } = {},
): Promise<T> {
  const startedAt = performance.now();
  const thresholdMs = Number.isFinite(options.thresholdMs) && Number(options.thresholdMs) >= 0 ? Number(options.thresholdMs) : SLOW_DB_OPERATION_MS;
  const normalizedOperation = safeOperation(operation);
  try {
    const result = await handler();
    const elapsedMs = durationMs(startedAt);
    if (process.env.API_OBSERVABILITY_LOG_ALL === "true" || elapsedMs >= thresholdMs) {
      writeLog("warn", "db_operation", {
        operation: normalizedOperation,
        source: options.source || "db",
        duration_ms: elapsedMs,
        ...(elapsedMs >= thresholdMs ? { performance: "slow_db_operation" } : {}),
        ...(getCurrentRequestId() ? { request_id: getCurrentRequestId() } : {}),
      });
    }
    return result;
  } catch (error) {
    writeLog("error", "db_error", {
      operation: normalizedOperation,
      source: options.source || "db",
      duration_ms: durationMs(startedAt),
      error_code: "DB_OPERATION_FAILED",
      error_name: errorName(error),
      ...(getCurrentRequestId() ? { request_id: getCurrentRequestId() } : {}),
    });
    throw error;
  }
}

/**
 * Measures API response time and emits only errors, slow requests, or explicitly
 * enabled request logs. Sensitive request headers and bodies are never logged.
 */
export async function withApiTiming<T extends Response>(
  route: string,
  handler: () => Promise<T>,
  options: ApiTimingOptions = {},
): Promise<T> {
  const startedAt = performance.now();
  const requestId = createRequestId(options.request);
  const method = options.request?.method || "UNKNOWN";
  const durationSource = options.source || "api";
  const identity = safeIdentity(options.userId);
  const role = safeIdentity(options.userRole);

  try {
    const response = await requestContext.run(requestId, handler);
    const elapsedMs = durationMs(startedAt);
    response.headers.set("Server-Timing", `app;dur=${elapsedMs}`);
    response.headers.set(REQUEST_ID_HEADER, requestId);

    const isError = response.status >= 500;
    const isClientFailure = response.status >= 400;
    const isSlow = elapsedMs >= SLOW_REQUEST_MS;
    const logAll = process.env.API_OBSERVABILITY_LOG_ALL === "true";
    if (logAll || isError || isClientFailure || isSlow) {
      writeLog(isError ? "error" : isClientFailure || isSlow ? "warn" : "info", "api_request", {
        request_id: requestId,
        route,
        method,
        source: durationSource,
        status_code: response.status,
        duration_ms: elapsedMs,
        ...(isError ? { error_code: "HTTP_5XX" } : isClientFailure ? { error_code: "HTTP_4XX" } : {}),
        ...(isSlow ? { performance: "slow_request" } : {}),
        ...(identity ? { user_id: identity } : {}),
        ...(role ? { user_role: role } : {}),
      });
    }
    return response;
  } catch (error) {
    const elapsedMs = durationMs(startedAt);
    writeLog("error", "api_error", {
      request_id: requestId,
      route,
      method,
      source: durationSource,
      status_code: 500,
      duration_ms: elapsedMs,
      error_code: "UNHANDLED_EXCEPTION",
      error_name: errorName(error),
      ...(identity ? { user_id: identity } : {}),
      ...(role ? { user_role: role } : {}),
    });
    throw error;
  }
}
