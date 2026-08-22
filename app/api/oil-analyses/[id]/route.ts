import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const doc = await (db.collection("oil_analyses") as any).findOne(
    { _id: new ObjectId(params.id) },
    { projection: { pdf_url: 1, pdf_b64: 1, pdf_filename: 1 } },
  );
  if (!doc?.pdf_url && !doc?.pdf_b64) return NextResponse.json({ error: "PDF bulunamadı." }, { status: 404 });
  return NextResponse.json({ pdf_url: doc.pdf_url, pdf_b64: doc.pdf_b64, pdf_filename: doc.pdf_filename || "analiz.pdf" });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const col = db.collection("oil_analyses") as any;
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

  const canDelete = ["yonetici", "planlamaci"].includes(user.role) || doc.uploaded_by_id === user._id;
  if (!canDelete) return NextResponse.json({ error: "Bu kaydı silme yetkiniz yok." }, { status: 403 });

  await col.deleteOne({ _id: doc._id });
  return NextResponse.json({ ok: true });
}
