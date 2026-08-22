import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface HistoryEntry {
  date: string;
  hours: number;
  load_kw?: number;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
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

  const enginesCol = db.collection("engines") as any;
  const engine = await enginesCol.findOne({ _id: params.id });
  if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const update: Record<string, any> = { history: sorted, updated_at: new Date() };
  // Geçmişteki en güncel kayıt, motorun 'güncel' çalışma saati ve yükünü de temsil eder
  if (sorted.length > 0) {
    update.hours = sorted[sorted.length - 1].hours;
    if (typeof sorted[sorted.length - 1].load_kw === "number") {
      update.load_kw = sorted[sorted.length - 1].load_kw;
    }
  }

  await enginesCol.updateOne({ _id: params.id }, { $set: update });
  return NextResponse.json({ ok: true, hours: update.hours ?? engine.hours });
}
