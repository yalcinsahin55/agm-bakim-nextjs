import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getClientIp } from "@/lib/rate-limit";
import { checkDistributedRateLimit } from "@/lib/redisRateLimit";
import { evaluateAssistantQuestion, ASSISTANT_RATE_LIMIT, ASSISTANT_RATE_WINDOW_MS } from "@/lib/assistantPolicy";
import { runAssistantTool } from "@/lib/assistantTools";
import { usersCollection } from "@/lib/dbCollections";
import { withApiTiming } from "@/lib/performance";
import { normalizeExportOptions } from "@/lib/assistantExport";
import { applyExportTypeExclusions } from "@/lib/assistantExportFilters";
import { createExcel } from "@/lib/assistantExportExcel";
import { createPdf } from "@/lib/assistantExportPdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_QUESTION_LENGTH = 300;
type ExportFormat = "pdf" | "excel";

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function getAssistantExport(req: NextRequest): Promise<Response> {
  const db = await getDb();
  const user = await getCurrentUser(req, usersCollection(db));
  if (!user) return jsonError("Giriş gerekli", 401);
  if (!hasPermission(user.role, "assistant:read")) return jsonError("Bakım asistanı raporlarını indirme yetkiniz yok.", 403);

  const rate = await checkDistributedRateLimit({
    scope: "assistant-export",
    identifier: `${user._id}:${getClientIp(req)}`,
    limit: ASSISTANT_RATE_LIMIT,
    windowMs: ASSISTANT_RATE_WINDOW_MS,
  }, "fail-closed");
  if (rate.infrastructureFailure) return jsonError("İstek koruma servisi geçici olarak kullanılamıyor. Lütfen biraz sonra tekrar deneyin.", 503);
  if (!rate.ok) return jsonError("Çok fazla rapor istendi. Lütfen biraz sonra tekrar deneyin.", 429);

  const searchParams = new URL(req.url).searchParams;
  const question = searchParams.get("question")?.trim() || "";
  const format = searchParams.get("format") as ExportFormat | null;
  if (!question || question.length > MAX_QUESTION_LENGTH) return jsonError("Geçerli bir soru gerekli.", 400);
  if (format !== "pdf" && format !== "excel") return jsonError("Desteklenmeyen rapor formatı.", 400);

  const policy = evaluateAssistantQuestion(question);
  if (!policy.ok || !policy.query) return jsonError(policy.message || "Bu soru rapora dönüştürülemedi.", 400);
  const requestedExcludedTypes = String(searchParams.get("exclude_type_label") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 30);
  const query = requestedExcludedTypes.length ? { ...policy.query, excludedTypeLabels: requestedExcludedTypes } : policy.query;
  const resultFromQuery = await runAssistantTool(db, query, { userId: user._id });
  const options = normalizeExportOptions(policy.query.intent, resultFromQuery.data, {
    preset: searchParams.get("preset"),
    columns: searchParams.get("columns"),
    sheets: searchParams.get("sheets"),
    orientation: searchParams.get("orientation"),
    page_size: searchParams.get("page_size"),
    margin: searchParams.get("margin"),
    sort: searchParams.get("sort"),
    include_logo: searchParams.get("include_logo"),
    include_footer: searchParams.get("include_footer"),
    logo_url: searchParams.get("logo_url"),
    exclude_type_label: searchParams.get("exclude_type_label"),
  });
  const result = options.excludedTypes.length
    ? applyExportTypeExclusions(resultFromQuery, options.excludedTypes)
    : resultFromQuery;
  return format === "pdf" ? createPdf(result, question, options) : createExcel(result, question, options);
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/assistant/export", () => getAssistantExport(req), { request: req   }).catch((error) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message.replace(/[\\r\\n]+/g, " ").slice(0, 240) : "";
    console.error("GET /api/assistant/export hatası:", JSON.stringify({ name: errorName, message: errorMessage }));
    return jsonError("PDF/Excel raporu hazırlanırken bir hata oluştu.", 500);
  });
}
