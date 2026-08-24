import { equipmentInfoCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

const FIELDS = ["kaver_tipi", "hava_filtresi", "krankcase", "esanjor_tipi", "dungs", "radyator_tipi", "not"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
  }
  const rateLimited = await enforceApiRateLimit(req, "equipment-info-update", 60, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const col = equipmentInfoCollection(db);
  const existing = await col.findOne({ _id: id });
  if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

  const body = await req.json();
  const update: Record<string, any> = {};
  for (const f of FIELDS) {
    if (f in body) update[f] = body[f] || null;
  }

  await col.updateOne({ _id: id }, { $set: update });
  return NextResponse.json({ ok: true });
}
