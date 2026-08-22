import type { Db } from "mongodb";

export async function recomputeLastMaintenance(db: Db, engineId: string, typeKey: string): Promise<void> {
  const recordsCol = db.collection("maintenance_records") as any;
  const latest = await recordsCol.findOne(
    { engine_id: engineId, type_key: typeKey },
    {
      projection: { hour_at_completion: 1 },
      sort: { hour_at_completion: -1 },
    },
  );
  const maxHour = typeof latest?.hour_at_completion === "number" ? latest.hour_at_completion : 0;
  const typesCol = db.collection("maintenance_types") as any;
  await typesCol.updateOne(
    { _id: typeKey },
    { $set: { [`engine_states.${engineId}.last_maintenance_hour`]: maxHour } },
    { upsert: true },
  );
}
