import { NextResponse } from "next/server";
import { handleUpload, put } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 🩺 TEŞHİS: Sunucunun gördüğü deponun Public mi Private mi olduğunu gösterir
export async function GET(req) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users"));
  let testUrl = null;
  let testError = null;
  try {
    const b = await put(`diag/test-${Date.now()}.txt`, "public test", { access: "public" });
    testUrl = b.url;
  } catch (e) {
    testError = String(e.message || e);
  }
  return NextResponse.json({
    ok: true,
    loggedIn: Boolean(user),
    tokenSet: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    testUrl,
    testError,
  });
}

export async function POST(req) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users"));
  if (!user) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN tanımlı değil! Vercel ortam değişkeni eksik." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({}),
      onUploadCompleted: async ({ blob }) => {
        console.log("Video yüklendi:", blob.url);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Upload hatası:", error);
    return NextResponse.json(
      { error: "Yükleme hatası: " + (error.message || "bilinmeyen") },
      { status: 400 }
    );
  }
}
