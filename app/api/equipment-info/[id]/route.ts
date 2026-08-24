import { equipmentInfoCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

const FIELDS = ["kaver_tipi", "hava_filtresi", "krankcase", "esanjor_tipi", "dungs", "radyator_tipi", "not"] as const;
type EquipmentInfoField = typeof FIELDS[number];

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

  const body = await req.json().catch(() => ({}));
  const update: Partial<Record<EquipmentInfoField, string | null>> = {};
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  for (const field of FIELDS) {
    if (field in input) {
      const value = input[field];
      update[field] = typeof value === "string" && value.trim() ? value.trim() : null;
    }
  }

  await col.updateOne({ _id: id }, { $set: update });
  return NextResponse.json({ ok: true });
}
