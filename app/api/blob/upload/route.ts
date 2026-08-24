import { usersCollection } from "@/lib/dbCollections";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

const allowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

function isAllowedPathname(pathname: unknown): pathname is string {
  return typeof pathname === "string" && pathname.length <= 220 && /^(photos|oil-analyses)\/[^/\\.][^/]*$/.test(pathname) && !pathname.includes("..") && !pathname.includes("\0");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = await getDb();
  const user = await getCurrentUser(request, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canWriteMaintenance(user.role)) return NextResponse.json({ error: "Bu hesap dosya yükleyemez." }, { status: 403 });
  const rateLimited = await enforceApiRateLimit(request, "blob-upload-legacy", 60, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as HandleUploadBody;
  if (body.type === "blob.generate-client-token" && !isAllowedPathname(body.payload?.pathname)) {
    return NextResponse.json({ error: "Geçersiz dosya yolu." }, { status: 400 });
  }

  try {
    const token = process.env.VERCEL ? undefined : (process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN);
    const jsonResponse = await handleUpload({
      ...(token ? { token } : {}),
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedPathname(pathname)) throw new Error("Geçersiz dosya yolu.");
        const pathAllowedContentTypes = pathname.startsWith("oil-analyses/") ? ["application/pdf"] : allowedContentTypes.filter((type) => type !== "application/pdf");
        return {
        allowedContentTypes: pathAllowedContentTypes,
        maximumSizeInBytes: 100 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: user._id, pathname }),
        };
      },
      onUploadCompleted: async () => {
        // Dosyanın kayda bağlanması, bakım kaydı kaydedilirken URL ile yapılır.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Blob upload token hatası:", error);
    return NextResponse.json({ error: "Dosya yükleme yetkilendirmesi başarısız." }, { status: 500 });
  }
}
