import { issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { PresignedUrlPayload } from "@vercel/blob";
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
const PHOTO_UPLOAD_PREFIX = "photos/";
const VIDEO_UPLOAD_PREFIX = "videos/";
const REPORT_UPLOAD_CLIENT_PAYLOAD = "maintenance-report";
const PHOTO_UPLOAD_CLIENT_PAYLOAD = "maintenance-photo";
const VIDEO_UPLOAD_CLIENT_PAYLOAD = "maintenance-video";
const OIL_ANALYSIS_UPLOAD_CLIENT_PAYLOAD = "oil-analysis";
const OIL_ANALYSIS_UPLOAD_PREFIX = "oil-analyses/";
const REPORT_UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const OIL_ANALYSIS_MAX_BYTES = 10 * 1024 * 1024;

const PHOTO_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const VIDEO_UPLOAD_MIME_TYPES = ["video/*"] as const;
const OIL_ANALYSIS_UPLOAD_MIME_TYPES = ["application/pdf"] as const;

type UploadPolicy = {
  prefix: string;
  allowedContentTypes: readonly string[];
  maximumSizeInBytes: number;
};

const UPLOAD_POLICIES: Record<string, UploadPolicy> = {
  [REPORT_UPLOAD_CLIENT_PAYLOAD]: {
    prefix: REPORT_UPLOAD_PREFIX,
    allowedContentTypes: REPORT_ATTACHMENT_MIME_TYPES,
    maximumSizeInBytes: REPORT_ATTACHMENT_MAX_BYTES,
  },
  [PHOTO_UPLOAD_CLIENT_PAYLOAD]: {
    prefix: PHOTO_UPLOAD_PREFIX,
    allowedContentTypes: PHOTO_UPLOAD_MIME_TYPES,
    maximumSizeInBytes: PHOTO_MAX_BYTES,
  },
  [VIDEO_UPLOAD_CLIENT_PAYLOAD]: {
    prefix: VIDEO_UPLOAD_PREFIX,
    allowedContentTypes: VIDEO_UPLOAD_MIME_TYPES,
    maximumSizeInBytes: VIDEO_MAX_BYTES,
  },
  [OIL_ANALYSIS_UPLOAD_CLIENT_PAYLOAD]: {
    prefix: OIL_ANALYSIS_UPLOAD_PREFIX,
    allowedContentTypes: OIL_ANALYSIS_UPLOAD_MIME_TYPES,
    maximumSizeInBytes: OIL_ANALYSIS_MAX_BYTES,
  },
};

interface GeneratePresignedUrlBody {
  type: "blob.generate-presigned-url";
  payload: {
    pathname: string;
    clientPayload?: string | null;
    multipart?: boolean;
  };
}

type UploadPresignedBody = GeneratePresignedUrlBody;

function isSafeReportUploadPath(pathname: string): boolean {
  if (!pathname.startsWith(REPORT_UPLOAD_PREFIX) || pathname.includes("..")) return false;
  const filename = pathname.slice(REPORT_UPLOAD_PREFIX.length);
  if (!filename || filename.length > 250 || filename !== sanitizeReportAttachmentFilename(filename)) return false;
  return Boolean(getReportAttachmentExtension(filename));
}

function isSafeMediaUploadPath(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix) || pathname.includes("..")) return false;
  const filename = pathname.slice(prefix.length);
  return Boolean(filename)
    && filename.length <= 250
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename);
}

function isSafeOilAnalysisUploadPath(pathname: string): boolean {
  return isSafeMediaUploadPath(pathname, OIL_ANALYSIS_UPLOAD_PREFIX) && pathname.toLowerCase().endsWith(".pdf");
}

function isGeneratePresignedUrlBody(value: unknown): value is GeneratePresignedUrlBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { type?: unknown; payload?: unknown };
  if (candidate.type !== "blob.generate-presigned-url" || typeof candidate.payload !== "object" || candidate.payload === null || Array.isArray(candidate.payload)) return false;
  const payload = candidate.payload as { pathname?: unknown; clientPayload?: unknown; multipart?: unknown };
  return typeof payload.pathname === "string"
    && (payload.clientPayload === undefined || payload.clientPayload === null || typeof payload.clientPayload === "string")
    && (payload.multipart === undefined || typeof payload.multipart === "boolean");
}

function toPresignedUrlPayload(presignedUrl: string): PresignedUrlPayload {
  const url = new URL(presignedUrl);
  const delegationToken = url.searchParams.get("vercel-blob-delegation");
  const signature = url.searchParams.get("vercel-blob-signature");
  if (!delegationToken || !signature) throw new Error("Presigned Blob URL eksik imza içeriyor.");

  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== "vercel-blob-delegation" && key !== "vercel-blob-signature") params[key] = value;
  }
  return { delegationToken, signature, params };
}

function isAllowedUploadPath(pathname: string, clientPayload: string | null | undefined): boolean {
  if (clientPayload === REPORT_UPLOAD_CLIENT_PAYLOAD) return isSafeReportUploadPath(pathname);
  if (clientPayload === OIL_ANALYSIS_UPLOAD_CLIENT_PAYLOAD) return isSafeOilAnalysisUploadPath(pathname);
  const policy = clientPayload ? UPLOAD_POLICIES[clientPayload] : undefined;
  return policy ? isSafeMediaUploadPath(pathname, policy.prefix) : false;
}

async function postPresignedUpload(request: NextRequest): Promise<Response> {
  const db = await getDb();
  const user = await getCurrentUser(request, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canWriteMaintenance(user.role)) {
    return NextResponse.json({ error: "Bu hesap dosya yükleyemez." }, { status: 403 });
  }

  const rateLimited = await enforceApiRateLimit(request, "blob-upload", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  try {
    const body: unknown = await request.json();
    if (!isGeneratePresignedUrlBody(body)) {
      return NextResponse.json({ error: "Geçersiz Blob presigned upload isteği." }, { status: 400 });
    }

    const { pathname, clientPayload, multipart } = body.payload;
    const policy = clientPayload ? UPLOAD_POLICIES[clientPayload] : undefined;
    if (!policy || !isAllowedUploadPath(pathname, clientPayload)) {
      return NextResponse.json({ error: "Geçersiz dosya yolu veya upload amacı." }, { status: 400 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN;
    const storeId = process.env.BLOB_STORE_ID || process.env.MEDIA_STORE_ID;
    if (!token && !storeId) {
      console.error("Presigned Blob upload credential hatası: BLOB_CREDENTIALS_UNAVAILABLE");
      return NextResponse.json({ error: "Dosya depolama bağlantısı yapılandırılmamış.", code: "BLOB_CREDENTIALS_UNAVAILABLE" }, { status: 503 });
    }

    const signedToken = await issueSignedToken({
      ...(token ? { token } : {}),
      ...(storeId ? { storeId } : {}),
      pathname,
      operations: ["put"],
      allowedContentTypes: [...policy.allowedContentTypes],
      maximumSizeInBytes: policy.maximumSizeInBytes,
      validUntil: Date.now() + REPORT_UPLOAD_TOKEN_TTL_MS,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      access: "public",
      operation: "put",
      pathname,
      addRandomSuffix: true,
      allowedContentTypes: [...policy.allowedContentTypes],
      maximumSizeInBytes: policy.maximumSizeInBytes,
      validUntil: signedToken.validUntil,
      ...(multipart ? {} : {}),
    });

    return NextResponse.json({
      type: "blob.generate-presigned-url",
      presignedUrlPayload: toPresignedUrlPayload(presignedUrl),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "UnknownError";
    const errorCode = /credential|token|sign/i.test(reason) ? "BLOB_PRESIGN_CREDENTIAL_ERROR" : "BLOB_PRESIGN_ERROR";
    console.error("Presigned Blob upload hatası:", errorCode, reason.slice(0, 240));
    return NextResponse.json({ error: "Dosya depolama servisine bağlanılamadı. Lütfen tekrar deneyin.", code: errorCode }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  return withApiTiming("POST /api/blob/upload-presigned", () => postPresignedUpload(request), { request });
}
