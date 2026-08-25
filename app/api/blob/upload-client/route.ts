import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { usersCollection } from "@/lib/dbCollections";
import { withApiTiming } from "@/lib/performance";
import {
  REPORT_ATTACHMENT_MAX_BYTES,
  REPORT_ATTACHMENT_MIME_TYPES,
  getReportAttachmentExtension,
  sanitizeReportAttachmentFilename,
} from "@/lib/reportAttachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_UPLOAD_PREFIX = "report-attachments/";
const REPORT_UPLOAD_CLIENT_PAYLOAD = "maintenance-report";

function isSafeReportUploadPath(pathname: string): boolean {
  if (!pathname.startsWith(REPORT_UPLOAD_PREFIX) || pathname.includes("..")) return false;
  const filename = pathname.slice(REPORT_UPLOAD_PREFIX.length);
  if (!filename || filename.length > 250 || filename !== sanitizeReportAttachmentFilename(filename)) return false;
  return Boolean(getReportAttachmentExtension(filename));
}

async function postClientUpload(request: NextRequest): Promise<Response> {
  const db = await getDb();
  const user = await getCurrentUser(request, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canWriteMaintenance(user.role)) {
    return NextResponse.json({ error: "Bu hesap rapor eki yükleyemez." }, { status: 403 });
  }

  const rateLimited = await enforceApiRateLimit(request, "blob-upload", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json().catch(() => null) as HandleUploadBody | null;
    if (!body || typeof body !== "object" || !("type" in body)) {
      return NextResponse.json({ error: "Geçersiz Blob upload isteği." }, { status: 400 });
    }
    if (body.type === "blob.generate-client-token" && body.payload.clientPayload !== REPORT_UPLOAD_CLIENT_PAYLOAD) {
      return NextResponse.json({ error: "Geçersiz rapor eki upload isteği." }, { status: 400 });
    }

    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (clientPayload !== REPORT_UPLOAD_CLIENT_PAYLOAD || !isSafeReportUploadPath(pathname)) {
          throw new Error("Geçersiz rapor eki yolu veya upload amacı.");
        }
        return {
          allowedContentTypes: [...REPORT_ATTACHMENT_MIME_TYPES],
          maximumSizeInBytes: REPORT_ATTACHMENT_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: user._id,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Client Blob rapor eki upload token hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Rapor eki depolama servisine bağlanılamadı. Lütfen tekrar deneyin." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  return withApiTiming("POST /api/blob/upload-client", () => postClientUpload(request), { request });
}
