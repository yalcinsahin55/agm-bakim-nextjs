import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export function enforceApiRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
  identity?: string,
): NextResponse | null {
  const key = `${scope}:${identity || getClientIp(req)}`;
  const result = checkRateLimit(key, limit, windowMs);
  if (result.ok) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  return NextResponse.json(
    { error: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
