import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!["yonetici", "planlamaci"].includes(user.role)) {
      return NextResponse.json({ error: "Bu işlem için yönetici veya planlamacı yetkisi gerekir." }, { status: 403 });
    }

    const { updates } = await req.json();
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Geçersiz veri formatı." }, { status: 400 });
    }
    
    if (updates.length === 0) {
      return NextResponse.json({ error: "Güncellenecek veri bulunamadı." }, { status: 400 });
    }

    const enginesCol = db.collection("engines");
    const stamp = new Date();
    let changed = 0;

    for (const u of updates) {
      if (!u.engine_id) continue;
      
      const existing = await enginesCol.findOne({ _id: u.engine_id });
      if (!existing) continue;

      const setFields = {};
      let pushHistory = false;
      let hoursChanged = false;
      let loadChanged = false;

      if (typeof u.hours === "number" && u.hours !== existing.hours) {
        setFields.hours = u.hours;
        hoursChanged = true;
      }
      if (typeof u.load_kw === "number" && u.load_kw !== (existing.load_kw || 0)) {
        setFields.load_kw = u.load_kw;
        loadChanged = true;
      }
      if (Object.keys(setFields).length === 0) continue;
      pushHistory = hoursChanged || loadChanged;

      setFields.updated_at = stamp;
      const updateOp = { $set: setFields };
      if (pushHistory) {
        updateOp.$push = {
          history: {
            date: stamp.toISOString(),
            hours: hoursChanged ? u.hours : existing.hours,
            load_kw: loadChanged ? u.load_kw : (existing.load_kw || 0),
          },
        };
      }
      await enginesCol.updateOne({ _id: u.engine_id }, updateOp);
      changed++;
    }

    return NextResponse.json({ ok: true, changed });
  } catch (error) {
    console.error("Motor saatleri güncellenirken hata:", error);
    return NextResponse.json({ error: "Motor saatleri güncellenirken bir hata oluştu." }, { status: 500 });
  }
}
