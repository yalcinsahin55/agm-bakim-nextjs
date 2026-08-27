import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ensureAppIndexes, getAppIndexStatus } from "@/lib/dbIndexes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

function noStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  };
}

function constantTimeSecretMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") || "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  return Boolean(secret && provided && constantTimeSecretMatch(provided, secret));
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  const startedAt = Date.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    await ensureAppIndexes(db);
    const indexes = getAppIndexStatus();
    const healthy = indexes.state !== "degraded";
    return NextResponse.json(
      {
        ok: healthy,
        service: "mongodb",
        status: healthy ? "healthy" : "degraded",
        indexes,
        latency_ms: Date.now() - startedAt,
        checked_at: new Date().toISOString(),
      },
      { status: healthy ? 200 : 503, headers: noStoreHeaders() },
    );
  } catch (error) {
    console.error(
      "[health/mongodb] probe failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      {
        ok: false,
        service: "mongodb",
        status: "unhealthy",
        checked_at: new Date().toISOString(),
      },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}
