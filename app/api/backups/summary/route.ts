import { recordsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { ensureAppIndexes } from "@/lib/dbIndexes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureAppIndexes(db);
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!canManageUsers(user.role)) return NextResponse.json({ error: "Yedekleme özetine erişim yetkiniz yok." }, { status: 403 });

    const names = ["users", "engines", "maintenance_types", "maintenance_records", "oil_analyses", "notifications", "audit_logs"] as const;
    const counts = await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments({})] as const));
    const latestRecord = await recordsCollection(db).findOne({}, { sort: { created_at: -1 }, projection: { created_at: 1 } });
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      collections: Object.fromEntries(counts),
      latest_maintenance_at: latestRecord?.created_at || null,
    });
  } catch (error) {
    console.error("GET /api/backups/summary hatası:", error);
    return NextResponse.json({ error: "Yedekleme özeti yüklenemedi." }, { status: 500 });
  }
}
