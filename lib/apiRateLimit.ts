import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/rate-limit";
import { checkDistributedRateLimit, checkDistributedRateLimitBatch, type RateLimitFailureMode } from "@/lib/redisRateLimit";

const FAIL_CLOSED_SCOPES = new Set([
  "login-ip-v2",
  "login-identifier-v2",
  "register",
  "seed",
  "backup-restore",
  "blob-upload",
  "blob-upload-legacy",
  "video-upload",
  "import-hours",
  "import-pressure-readings",
  "import-equipment-info",
  "export-excel",
  "export-pdf",
  "records-create",
  "records-update",
  "records-delete",
  "maintenance-type-create",
  "maintenance-type-change",
  "push-subscribe",
  "push-unsubscribe",
  "assistant",
  "user-list",
  "user-create",
  "user-update",
  "user-deactivate",
  "user-password-reset",
  "password-change-ip",
  "password-change-user",
  "engine-create",
  "engine-hours-update",
  "engine-history-update",
  "equipment-info-create",
  "equipment-info-update",
  "oil-analysis-create",
  "oil-analysis-delete",
  "pressure-reading-create",
  "pressure-reading-delete",
  "record-confirm",
  "audit-log-read",
]);

function getFailureMode(scope: string): RateLimitFailureMode {
  return FAIL_CLOSED_SCOPES.has(scope) ? "fail-closed" : "local-fallback";
}

function retryAfterSeconds(resetAt: number, fallbackMs: number): number {
  const remainingMs = resetAt - Date.now();
  return Math.max(1, Math.ceil(Math.max(remainingMs, fallbackMs) / 1000));
}

export async function enforceApiRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
  identity?: string,
): Promise<NextResponse | null> {
  const identifier = identity?.trim() || getClientIp(req);
  const result = await checkDistributedRateLimit(
    { scope, identifier, limit, windowMs },
    getFailureMode(scope),
  );

  if (result.infrastructureFailure) {
    return NextResponse.json(
      { error: "İstek koruma servisi geçici olarak kullanılamıyor. Lütfen biraz sonra tekrar deneyin." },
      {
        status: 503,
        headers: {
          "Retry-After": String(retryAfterSeconds(result.resetAt, 2000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  if (result.ok) return null;

  const retryAfter = retryAfterSeconds(result.resetAt, result.retryAfterMs);
  return NextResponse.json(
    { error: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}

export async function enforceCompositeRateLimit(
  req: NextRequest,
  requests: Array<{ scope: string; limit: number; windowMs: number; identity?: string }>,
): Promise<NextResponse | null> {
  const normalized = requests.map((request) => ({
    scope: request.scope,
    limit: request.limit,
    windowMs: request.windowMs,
    identifier: request.identity?.trim() || getClientIp(req),
  }));
  const result = await checkDistributedRateLimitBatch(normalized, "fail-closed");

  if (result.infrastructureFailure) {
    return NextResponse.json(
      { error: "İstek koruma servisi geçici olarak kullanılamıyor. Lütfen biraz sonra tekrar deneyin." },
      {
        status: 503,
        headers: {
          "Retry-After": String(retryAfterSeconds(result.resetAt, 2000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  if (result.ok) return null;

  return NextResponse.json(
    { error: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds(result.resetAt, result.retryAfterMs)),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}
