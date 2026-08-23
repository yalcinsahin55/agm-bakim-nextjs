import type { Db } from "mongodb";

export async function recomputeLastMaintenance(db: Db, engineId: string, typeKey: string): Promise<void> {
  const recordsCol = db.collection("maintenance_records") as any;
  const latest = await recordsCol.findOne(
    { engine_id: engineId, type_key: typeKey },
    {
      projection: { hour_at_completion: 1 },
      sort: { hour_at_completion: -1, maintenance_start_at: -1, created_at: -1 },
    },
  );
  const typesCol = db.collection("maintenance_types") as any;
  const type = await typesCol.findOne(
    { _id: typeKey },
    { projection: { engine_states: 1 } },
  );
  const currentState = type?.engine_states?.[engineId];

  if (!latest) {
    // Yalnızca kayıt oluşturulurken otomatik açılmış takip silinir. Eski veya
    // yönetici tarafından bilinçli tanımlanmış takipler geriye dönük bozulmaz.
    if (currentState?.tracking_source === "record") {
      await typesCol.updateOne(
        { _id: typeKey },
        { $unset: { [`engine_states.${engineId}`]: "" } },
      );
    }
    return;
  }

  const maxHour = typeof latest.hour_at_completion === "number" ? latest.hour_at_completion : 0;
  await typesCol.updateOne(
    { _id: typeKey },
    { $set: { [`engine_states.${engineId}.last_maintenance_hour`]: maxHour } },
  );
}
