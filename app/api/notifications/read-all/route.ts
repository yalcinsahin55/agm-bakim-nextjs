import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    const rateLimited = await enforceApiRateLimit(req, "notifications-read-all", 30, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    await db.collection("notifications").updateMany(
      { user_id: user._id, read_at: null },
      { $set: { read_at: new Date(), updated_at: new Date() } },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Bildirimler okunurken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Bildirimler okunamadı." }, { status: 500 });
  }
}
