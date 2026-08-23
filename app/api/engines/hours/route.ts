import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

interface EngineUpdate {
  engine_id: string;
  hours?: number;
  load_kw?: number;
}

export async function PATCH(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
    }
    const rateLimited = await enforceApiRateLimit(req, "engine-hours-update", 120, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const { updates } = await req.json();
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Geçersiz veri formatı." }, { status: 400 });
    }

    if (updates.length === 0 || updates.length > 100) {
      return NextResponse.json({ error: "Güncellenecek motor sayısı 1 ile 100 arasında olmalıdır." }, { status: 400 });
    }
    for (const update of updates as unknown[]) {
      if (!update || typeof update !== "object") {
        return NextResponse.json({ error: "Geçersiz motor güncellemesi." }, { status: 400 });
      }
      const item = update as Partial<EngineUpdate>;
      if (typeof item.engine_id !== "string" || !item.engine_id.trim() || item.engine_id.length > 120) {
        return NextResponse.json({ error: "Geçerli bir motor kimliği gerekli." }, { status: 400 });
      }
      for (const value of [item.hours, item.load_kw]) {
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5_000_000)) {
          return NextResponse.json({ error: "Motor saati ve yük değeri geçerli, negatif olmayan sayılar olmalıdır." }, { status: 400 });
        }
      }
    }

    const enginesCol = db.collection("engines") as any;
    const stamp = new Date();
    let changed = 0;

    for (const u of updates as EngineUpdate[]) {
      const engineId = u.engine_id.trim();

      const existing = await enginesCol.findOne({ _id: engineId });
      if (!existing) continue;

      const setFields: Record<string, any> = {};
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
      const updateOp: Record<string, any> = { $set: setFields };
      if (pushHistory) {
        updateOp.$push = {
          history: {
            date: stamp.toISOString(),
            hours: hoursChanged ? u.hours : existing.hours,
            load_kw: loadChanged ? u.load_kw : (existing.load_kw || 0),
          },
        };
      }
      await enginesCol.updateOne({ _id: engineId }, updateOp);
      changed++;
    }

    if (changed > 0) invalidateMaintenancePanelServerCache();
    return NextResponse.json({ ok: true, changed });
  } catch (error) {
    console.error("Motor saatleri güncellenirken hata:", error);
    return NextResponse.json({ error: "Motor saatleri güncellenirken bir hata oluştu." }, { status: 500 });
  }
}
