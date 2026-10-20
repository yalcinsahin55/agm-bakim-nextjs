import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance, hasPermission } from "@/lib/permissions";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { listActiveTechnicians } from "@/lib/technicians";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureAppIndexes(db);
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!hasPermission(user.role, "maintenance:read")) {
      return NextResponse.json({ error: "Teknisyen listesine erişim yetkiniz yok." }, { status: 403 });
    }
    const rateLimited = await enforceApiRateLimit(req, "technician-list-read", 240, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;
    const technicians = await listActiveTechnicians(db);
    return NextResponse.json(canWriteMaintenance(user.role)
      ? technicians
      : technicians.map(({ id, full_name }) => ({ id, full_name })));
  } catch (error) {
    console.error("GET /api/users/technicians hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Teknisyen listesi yüklenemedi." }, { status: 500 });
  }
}
