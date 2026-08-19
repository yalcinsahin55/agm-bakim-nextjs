import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FIELDS = ["kaver_tipi", "hava_filtresi", "krankcase", "esanjor_tipi", "dungs", "radyator_tipi", "not"];

export async function PATCH(req, { params }) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!["yonetici", "planlamaci"].includes(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici veya planlamacı yetkisi gerekir." }, { status: 403 });
  }

  const col = db.collection("equipment_info");
  const existing = await col.findOne({ _id: params.id });
  if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

  const body = await req.json();
  const update = {};
  for (const f of FIELDS) {
    if (f in body) update[f] = body[f] || null;
  }

  await col.updateOne({ _id: params.id }, { $set: update });
  return NextResponse.json({ ok: true });
}
