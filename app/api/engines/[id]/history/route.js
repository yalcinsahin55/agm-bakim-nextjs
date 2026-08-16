import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!["yonetici", "planlamaci"].includes(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici veya planlamacı yetkisi gerekir." }, { status: 403 });
  }

  const { history } = await req.json();
  if (!Array.isArray(history)) {
    return NextResponse.json({ error: "Geçersiz veri." }, { status: 400 });
  }
  for (const h of history) {
    if (typeof h.hours !== "number" || !h.date) {
      return NextResponse.json({ error: "Her kayıt için geçerli bir tarih ve saat gerekli." }, { status: 400 });
    }
  }

  const enginesCol = db.collection("engines");
  const engine = await enginesCol.findOne({ _id: params.id });
  if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

  const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));

  const update = { history: sorted, updated_at: new Date() };
  // Geçmişteki en güncel kayıt, motorun 'güncel' çalışma saatini de temsil eder —
  // düzenleme/silme sonrası bu değeri tutarlı tutmak için de güncellenir.
  if (sorted.length > 0) {
    update.hours = sorted[sorted.length - 1].hours;
  }

  await enginesCol.updateOne({ _id: params.id }, { $set: update });
  return NextResponse.json({ ok: true, hours: update.hours ?? engine.hours });
}
