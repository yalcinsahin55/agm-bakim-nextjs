import { usersCollection } from "@/lib/dbCollections";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getClientIp } from "@/lib/rate-limit";
import { checkDistributedRateLimit } from "@/lib/redisRateLimit";
import { evaluateAssistantQuestion, ASSISTANT_POLICY_VERSION, ASSISTANT_RATE_LIMIT, ASSISTANT_RATE_WINDOW_MS } from "@/lib/assistantPolicy";
import { runAssistantTool } from "@/lib/assistantTools";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

function jsonError(error: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error }, { status, headers });
}

async function postAssistant(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return jsonError("Giriş gerekli", 401);
    if (!hasPermission(user.role, "reports:read")) return jsonError("Bakım raporlarını görme yetkiniz yok.", 403);

    const rate = await checkDistributedRateLimit({
      scope: "assistant",
      identifier: `${user._id}:${getClientIp(req)}`,
      limit: ASSISTANT_RATE_LIMIT,
      windowMs: ASSISTANT_RATE_WINDOW_MS,
    }, "fail-closed");
    const retryAfter = Math.max(1, Math.ceil(Math.max(0, rate.resetAt - Date.now()) / 1000));
    if (rate.infrastructureFailure) {
      return jsonError("İstek koruma servisi geçici olarak kullanılamıyor. Lütfen biraz sonra tekrar deneyin.", 503, {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": "0",
      });
    }
    if (!rate.ok) {
      return jsonError("Çok fazla soru gönderildi. Lütfen biraz sonra tekrar deneyin.", 429, {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": "0",
      });
    }

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 10_000) return jsonError("İstek çok büyük.", 413);
    const body = await req.json().catch(() => ({}));
    const policy = evaluateAssistantQuestion(body?.question);
    if (!policy.ok) {
      const status = policy.code === "invalid_input" ? 400 : 200;
      return NextResponse.json({
        ok: false,
        policy_version: ASSISTANT_POLICY_VERSION,
        read_only: true,
        error_code: policy.code,
        message: policy.message,
      }, {
        status,
        headers: { "X-RateLimit-Remaining": String(rate.remaining) },
      });
    }

    const result = await runAssistantTool(db, policy.query!);
    return NextResponse.json({
      ok: true,
      policy_version: ASSISTANT_POLICY_VERSION,
      read_only: true,
      title: result.title,
      summary: result.summary,
      data: result.data,
      meta: {
        intent: result.intent,
        period: result.period,
        generated_at: new Date().toISOString(),
        date_range: policy.query?.dateRange || null,
        source: "AGM Bakım raporları",
        rate_limit_remaining: rate.remaining,
      },
    }, { headers: { "X-RateLimit-Remaining": String(rate.remaining) } });
  } catch (error) {
    console.error("POST /api/assistant hatası:", error instanceof Error ? error.name : "UnknownError");
    return jsonError("Asistan verileri hazırlanırken bir hata oluştu.", 500);
  }
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/assistant", () => postAssistant(req), { request: req });
}
