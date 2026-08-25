import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { usersCollection, recordsCollection } from "@/lib/dbCollections";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { isAllowedReportAttachmentUrl } from "@/lib/reportAttachments";
import { withApiTiming } from "@/lib/performance";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AttachmentRouteContext {
  params: Promise<{ id: string; attachmentId: string }>;
}

function encodeFilename(filename: string): string {
  return encodeURIComponent(filename).replace(/['()]/g, "");
}

function contentDisposition(filename: string, inline: boolean): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-180) || "rapor-eki";
  return `${inline ? "inline" : "attachment"}; filename="${safeFilename}"; filename*=UTF-8''${encodeFilename(filename)}`;
}

function isValidAttachmentId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,100}$/.test(value);
}

function canonicalMime(value: string): string {
  return value === "application/pdf"
    ? "application/pdf"
    : value === "application/vnd.ms-excel"
      ? "application/vnd.ms-excel"
      : value === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : value === "application/msword"
          ? "application/msword"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

async function getAttachment(request: NextRequest, { params }: AttachmentRouteContext): Promise<Response> {
  const { id, attachmentId } = await params;
  const db = await getDb();
  const user = await getCurrentUser(request, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(request, "record-attachment-read", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;
  if (!isValidAttachmentId(attachmentId)) return NextResponse.json({ error: "Geçersiz rapor eki kimliği." }, { status: 400 });
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Geçersiz bakım kaydı kimliği." }, { status: 400 });

  const record = await recordsCollection(db).findOne({ _id: new ObjectId(id) }, { projection: { report_attachments: 1 } }) as MaintenanceRecordDocument | null;
  if (!record) return NextResponse.json({ error: "Bakım kaydı bulunamadı." }, { status: 404 });

  const attachment = record.report_attachments?.find((item) => item.id === attachmentId);
  if (!attachment || !isAllowedReportAttachmentUrl(attachment.url)) return NextResponse.json({ error: "Rapor eki bulunamadı." }, { status: 404 });

  const upstream = await fetch(attachment.url, { redirect: "error", cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return NextResponse.json({ error: "Rapor eki depolamadan okunamadı." }, { status: 502 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const inline = !download && attachment.mime === "application/pdf";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": canonicalMime(attachment.mime),
      "Content-Disposition": contentDisposition(attachment.filename, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest, context: AttachmentRouteContext) {
  return withApiTiming("GET /api/records/[id]/attachments/[attachmentId]", () => getAttachment(request, context), { request });
}
