import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Geçersiz analiz kaydı." }, { status: 400 });

  const doc = await (db.collection("oil_analyses") as any).findOne(
    { _id: new ObjectId(id) },
    { projection: { pdf_url: 1, pdf_b64: 1, pdf_filename: 1 } },
  );
  if (!doc?.pdf_url && !doc?.pdf_b64) return NextResponse.json({ error: "PDF bulunamadı." }, { status: 404 });
  return NextResponse.json({ pdf_url: doc.pdf_url, pdf_b64: doc.pdf_b64, pdf_filename: doc.pdf_filename || "analiz.pdf" });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Geçersiz analiz kaydı." }, { status: 400 });
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  const rateLimited = await enforceApiRateLimit(req, "oil-analysis-delete", 60, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const col = db.collection("oil_analyses") as any;
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

  await col.deleteOne({ _id: doc._id });
  return NextResponse.json({ ok: true });
}
