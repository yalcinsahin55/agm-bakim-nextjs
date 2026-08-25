import { enginesCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { UpdateFilter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { refreshUserMaintenanceNotificationsBestEffort } from "@/lib/notifications";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { writeAuditLog } from "@/lib/audit";
import type { EngineDocument } from "@/lib/dbTypes";

export const dynamic = "force-dynamic";

interface EngineUpdate {
  engine_id: string;
  hours?: number;
  load_kw?: number;
}

export async function PATCH(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
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

    const enginesCol = enginesCollection(db);
    const stamp = new Date();
    const engineIds = [...new Set((updates as EngineUpdate[]).map((update) => update.engine_id.trim()))];
    const existingEngines = await enginesCol.find({ _id: { $in: engineIds } }).toArray();
    const workingEngines = new Map(existingEngines.map((engine) => [String(engine._id), engine]));
    const operations: Array<{ updateOne: { filter: { _id: string }; update: UpdateFilter<EngineDocument> } }> = [];
    const changes: Array<{ engine_id: string; engine: string; before: { hours: number; load_kw: number }; after: { hours: number; load_kw: number } }> = [];
    let changed = 0;

    for (const u of updates as EngineUpdate[]) {
      const engineId = u.engine_id.trim();
      const existing = workingEngines.get(engineId);
      if (!existing) continue;

      const setFields: Partial<Pick<EngineDocument, "hours" | "load_kw" | "updated_at">> = {};
      const hoursChanged = typeof u.hours === "number" && u.hours !== existing.hours;
      const loadChanged = typeof u.load_kw === "number" && u.load_kw !== (existing.load_kw || 0);
      if (!hoursChanged && !loadChanged) continue;
      if (hoursChanged && typeof u.hours === "number") setFields.hours = u.hours;
      if (loadChanged && typeof u.load_kw === "number") setFields.load_kw = u.load_kw;
      setFields.updated_at = stamp;

      const updateOp: UpdateFilter<EngineDocument> = { $set: setFields };
      const nextHours = hoursChanged && typeof u.hours === "number" ? u.hours : existing.hours;
      const nextLoadKw = loadChanged && typeof u.load_kw === "number" ? u.load_kw : (existing.load_kw || 0);
      if (hoursChanged || loadChanged) {
        updateOp.$push = { history: { date: stamp.toISOString(), hours: nextHours, load_kw: nextLoadKw } };
      }
      changes.push({ engine_id: engineId, engine: String(existing.name || engineId), before: { hours: Number(existing.hours || 0), load_kw: Number(existing.load_kw || 0) }, after: { hours: Number(nextHours || 0), load_kw: Number(nextLoadKw || 0) } });
      operations.push({ updateOne: { filter: { _id: engineId }, update: updateOp } });
      workingEngines.set(engineId, {
        ...existing,
        ...setFields,
        ...(hoursChanged || loadChanged ? {
          history: [...(Array.isArray(existing.history) ? existing.history : []), {
            date: stamp.toISOString(),
            hours: typeof setFields.hours === "number" ? setFields.hours : existing.hours,
            load_kw: typeof setFields.load_kw === "number" ? setFields.load_kw : (existing.load_kw || 0),
          }],
        } : {}),
      });
      changed++;
    }

    if (operations.length > 0) await enginesCol.bulkWrite(operations, { ordered: true });

    if (changed > 0) {
      await writeAuditLog(db, {
        user,
        action: "update",
        entity: "engine",
        entityId: changes.length === 1 ? changes[0]?.engine_id : undefined,
        summary: `${changed} motorun çalışma saati/yük bilgisi güncellendi`,
        before: { changes: changes.map((change) => ({ engine_id: change.engine_id, engine: change.engine, ...change.before })) },
        after: { changes: changes.map((change) => ({ engine_id: change.engine_id, engine: change.engine, ...change.after })) },
      });
      invalidateMaintenancePanelServerCache();
      await refreshUserMaintenanceNotificationsBestEffort(db, user);
    }
    return NextResponse.json({ ok: true, changed });
  } catch (error) {
    console.error("Motor saatleri güncellenirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Motor saatleri güncellenirken bir hata oluştu." }, { status: 500 });
  }
}
