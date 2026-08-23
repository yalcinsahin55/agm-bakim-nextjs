import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { evaluateAssistantQuestion, ASSISTANT_POLICY_VERSION, ASSISTANT_RATE_LIMIT, ASSISTANT_RATE_WINDOW_MS } from "@/lib/assistantPolicy";
import { runAssistantTool } from "@/lib/assistantTools";

export const dynamic = "force-dynamic";

function jsonError(error: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error }, { status, headers });
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, db.collection("users") as any);
    if (!user) return jsonError("Giriş gerekli", 401);
    if (!hasPermission(user.role, "reports:read")) return jsonError("Bakım raporlarını görme yetkiniz yok.", 403);

    const rate = checkRateLimit(`assistant:${user._id}:${getClientIp(req)}`, ASSISTANT_RATE_LIMIT, ASSISTANT_RATE_WINDOW_MS);
    if (!rate.ok) {
      return jsonError("Çok fazla soru gönderildi. Lütfen biraz sonra tekrar deneyin.", 429, {
        "Retry-After": String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))),
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
        source: "AGM Bakım raporları",
        rate_limit_remaining: rate.remaining,
      },
    }, { headers: { "X-RateLimit-Remaining": String(rate.remaining) } });
  } catch (error) {
    console.error("POST /api/assistant hatası:", error);
    return jsonError("Asistan verileri hazırlanırken bir hata oluştu.", 500);
  }
}
