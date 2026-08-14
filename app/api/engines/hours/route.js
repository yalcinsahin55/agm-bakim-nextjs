import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!["yonetici", "planlamaci"].includes(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici veya planlamacı yetkisi gerekir." }, { status: 403 });
  }

  const { updates } = await req.json(); // [{ engine_id, hours, load_kw }]
  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: "Geçersiz veri." }, { status: 400 });
  }

  const enginesCol = db.collection("engines");
  const stamp = new Date();
  let changed = 0;

  for (const u of updates) {
    const existing = await enginesCol.findOne({ _id: u.engine_id });
    if (!existing) continue;

    const setFields = {};
    let pushHistory = false;

    if (typeof u.hours === "number" && u.hours !== existing.hours) {
      setFields.hours = u.hours;
      pushHistory = true;
    }
    if (typeof u.load_kw === "number" && u.load_kw !== (existing.load_kw || 0)) {
      setFields.load_kw = u.load_kw;
    }
    if (Object.keys(setFields).length === 0) continue;

    setFields.updated_at = stamp;
    const updateOp = { $set: setFields };
    if (pushHistory) {
      updateOp.$push = { history: { date: stamp.toISOString(), hours: u.hours } };
    }
    await enginesCol.updateOne({ _id: u.engine_id }, updateOp);
    changed++;
  }

  return NextResponse.json({ ok: true, changed });
}
