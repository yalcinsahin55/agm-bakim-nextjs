import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  const rateLimited = await enforceApiRateLimit(req, "pressure-reading-delete", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Geçersiz ölçüm kaydı." }, { status: 400 });
  const col = db.collection("pressure_readings") as any;
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

  await col.deleteOne({ _id: doc._id });
  return NextResponse.json({ ok: true });
}
