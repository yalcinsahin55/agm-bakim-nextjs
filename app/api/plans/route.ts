import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { usersCollection } from "@/lib/dbCollections";
import { canWriteMaintenance } from "@/lib/permissions";
import { parseJsonBodyLimited } from "@/lib/requestLimits";
import { MAX_SMALL_JSON_REQUEST_BYTES } from "@/lib/requestLimits";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";
type Plan = { _id: string; engine_id: string; type_key: string; planned_date: string; status: "planned" | "in_progress" | "completed" | "cancelled"; technician_id?: string; note?: string; created_at: Date; updated_at: Date; created_by: string };
function clean(value: unknown, max = 160) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validDate(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value); }
async function auth(req: NextRequest) {
  const db = await getDb(); const user = await getCurrentUser(req, usersCollection(db));
  if (!user) return { db, user: null };
  return { db, user };
}
export async function GET(req: NextRequest) {
  try { const { db, user } = await auth(req); if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    const plans = await db.collection<Plan>("maintenance_plans").find({}).sort({ planned_date: 1, updated_at: -1 }).limit(5000).toArray(); return NextResponse.json(plans);
  } catch { return NextResponse.json({ error: "Planlar yüklenemedi." }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  try { const { db, user } = await auth(req); if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 }); if (!canWriteMaintenance(user.role)) return NextResponse.json({ error: "Plan yazma yetkiniz yok." }, { status: 403 });
    const limited = await enforceApiRateLimit(req, "plans-write", 60, 10 * 60 * 1000, user._id); if (limited) return limited;
    const parsed = await parseJsonBodyLimited(req, MAX_SMALL_JSON_REQUEST_BYTES); if (!parsed.ok) return NextResponse.json({ error: "Geçersiz plan verisi." }, { status: 400 });
    const body = parsed.value as Record<string, unknown>; const engine_id = clean(body.engine_id, 100); const type_key = clean(body.type_key, 100); const planned_date = clean(body.planned_date, 10); const status = clean(body.status, 20) as Plan["status"];
    if (!engine_id || !type_key || !validDate(planned_date)) return NextResponse.json({ error: "Motor, bakım türü ve geçerli tarih gerekli." }, { status: 400 });
    if (!["planned", "in_progress", "completed", "cancelled"].includes(status)) return NextResponse.json({ error: "Geçersiz plan durumu." }, { status: 400 });
    const now = new Date(); const collection = db.collection<Plan>("maintenance_plans"); const key = `${engine_id}:${type_key}`; const plan = { _id: key, engine_id, type_key, planned_date, status, technician_id: clean(body.technician_id, 100) || undefined, note: clean(body.note, 500) || undefined, updated_at: now, created_at: now, created_by: String(user._id) };
    await collection.updateOne({ _id: key }, { $set: plan, $setOnInsert: { created_at: now, created_by: String(user._id) } }, { upsert: true }); return NextResponse.json(plan);
  } catch { return NextResponse.json({ error: "Plan kaydedilemedi." }, { status: 500 }); }
}
