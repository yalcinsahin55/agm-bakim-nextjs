import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { listActiveTechnicians } from "@/lib/technicians";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureAppIndexes(db);
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!canWriteMaintenance(user.role)) {
      return NextResponse.json({ error: "Teknisyen listesine erişim yetkiniz yok." }, { status: 403 });
    }
    return NextResponse.json(await listActiveTechnicians(db));
  } catch (error) {
    console.error("GET /api/users/technicians hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Teknisyen listesi yüklenemedi." }, { status: 500 });
  }
}
