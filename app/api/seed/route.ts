import { enginesCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { seedIfEmpty } from "@/lib/seed";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { isSeedEndpointEnabled } from "@/lib/seedPolicy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSeedEndpointEnabled()) {
    return NextResponse.json({ error: "Production seed endpointi açıkça etkinleştirilmemiş." }, { status: 404 });
  }
  const db = await getDb();
  const rateLimited = await enforceApiRateLimit(req, "seed", 2, 60 * 60 * 1000);
  if (rateLimited) return rateLimited;
  const user = await getCurrentUser(req, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });

  await seedIfEmpty(db);
  const count = await enginesCollection(db).countDocuments();
  return NextResponse.json({ ok: true, engine_count: count });
}
