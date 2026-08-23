import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { normalizeWorkDomains } from "@/lib/technicians";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { key: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }

  const { key } = params;
  const { label, default_period_hours, apply_period_to_all, engine_states, remove_engine_ids, work_domains, allow_electromechanical_support, allow_electromechanical_responsible } = await req.json();

  const typesCol = db.collection("maintenance_types") as any;
  const type = await typesCol.findOne({ _id: key });
  if (!type) return NextResponse.json({ error: "Bakım türü bulunamadı." }, { status: 404 });

  const update: Record<string, any> = {};
  if (label) update.label = label.trim();
  if (typeof default_period_hours === "number") update.default_period_hours = default_period_hours;
  if (work_domains !== undefined) update.work_domains = normalizeWorkDomains(work_domains, "mekanik");
  if (allow_electromechanical_support !== undefined) update.allow_electromechanical_support = allow_electromechanical_support === true;
  if (allow_electromechanical_responsible !== undefined) update.allow_electromechanical_responsible = allow_electromechanical_responsible === true;
  if (Object.keys(update).length) await typesCol.updateOne({ _id: key }, { $set: update });

  if (apply_period_to_all && typeof default_period_hours === "number") {
    const engineIds = Object.keys(type.engine_states || {});
    for (const engId of engineIds) {
      await typesCol.updateOne({ _id: key }, { $set: { [`engine_states.${engId}.period_hours`]: default_period_hours, [`engine_states.${engId}.tracking_source`]: "manual" } });
    }
  }

  // 🎯 Motor bazlı periyot / son bakım saati düzeltme (yeni özellik)
  if (engine_states && typeof engine_states === "object") {
    for (const [engId, st] of Object.entries(engine_states as Record<string, any>)) {
      const set: Record<string, any> = {};
      if (typeof st?.period_hours === "number") set[`engine_states.${engId}.period_hours`] = st.period_hours;
      if (typeof st?.last_maintenance_hour === "number") set[`engine_states.${engId}.last_maintenance_hour`] = st.last_maintenance_hour;
      set[`engine_states.${engId}.tracking_source`] = "manual";
      if (Object.keys(set).length) await typesCol.updateOne({ _id: key }, { $set: set });
    }
  }

  const removeEngineIds = Array.isArray(remove_engine_ids)
    ? [...new Set(remove_engine_ids.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0))]
    : [];
  if (removeEngineIds.length > 0) {
    const unset: Record<string, ""> = {};
    removeEngineIds.forEach((engineId) => { unset[`engine_states.${engineId}`] = ""; });
    // Bir motor elle kapsamdan çıkarıldığında "all" kapsamı artık geçerli değildir.
    // explicit kapsam, yalnızca engine_states içinde bırakılan motorları gösterir.
    await typesCol.updateOne({ _id: key }, { $unset: unset, $set: { engine_scope: "explicit" } });
  }

  if (label && label.trim() !== type.label) {
    await (db.collection("maintenance_records") as any).updateMany({ type_key: key }, { $set: { type_label: label.trim() } });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { key: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }

  const { key } = params;
  await (db.collection("maintenance_records") as any).deleteMany({ type_key: key });
  await (db.collection("maintenance_types") as any).deleteOne({ _id: key });
  return NextResponse.json({ ok: true });
}
