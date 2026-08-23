import type { Db } from "mongodb";

const MAX_RECOMPUTE_ATTEMPTS = 3;

export async function recomputeLastMaintenance(db: Db, engineId: string, typeKey: string): Promise<void> {
  const recordsCol = db.collection("maintenance_records") as any;
  const typesCol = db.collection("maintenance_types") as any;
  const recordFilter = { engine_id: engineId, type_key: typeKey };
  const statePath = `engine_states.${engineId}`;

  for (let attempt = 0; attempt < MAX_RECOMPUTE_ATTEMPTS; attempt += 1) {
    const latest = await recordsCol.findOne(
      recordFilter,
      {
        projection: { _id: 1, hour_at_completion: 1 },
        sort: { hour_at_completion: -1, maintenance_start_at: -1, created_at: -1 },
      },
    );
    const type = await typesCol.findOne(
      { _id: typeKey },
      { projection: { engine_states: 1 } },
    );
    const currentState = type?.engine_states?.[engineId];

    if (!latest) {
      // Yalnızca kayıt oluşturulurken otomatik açılmış takip silinir. Eski veya
      // yönetici tarafından bilinçli tanımlanmış takipler geriye dönük bozulmaz.
      if (currentState?.tracking_source === "record") {
        const concurrentRecord = await recordsCol.findOne(recordFilter, { projection: { _id: 1 } });
        if (concurrentRecord) continue;
        await typesCol.updateOne(
          { _id: typeKey, [`${statePath}.tracking_source`]: "record" },
          { $unset: { [statePath]: "" } },
        );
        const recordAfterUpdate = await recordsCol.findOne(recordFilter, { projection: { _id: 1 } });
        if (recordAfterUpdate) continue;
      }
      return;
    }

    const maxHour = typeof latest.hour_at_completion === "number" ? latest.hour_at_completion : 0;
    await typesCol.updateOne(
      { _id: typeKey },
      { $set: { [`${statePath}.last_maintenance_hour`]: maxHour } },
    );

    // Yeni bir kayıt update ile aynı anda geldiyse ilk snapshot artık güncel
    // olmayabilir. Son snapshot değişmişse bir kez daha hesapla.
    const latestAfterUpdate = await recordsCol.findOne(
      recordFilter,
      {
        projection: { _id: 1 },
        sort: { hour_at_completion: -1, maintenance_start_at: -1, created_at: -1 },
      },
    );
    if (String(latestAfterUpdate?._id) === String(latest._id)) return;
  }

  console.warn("Bakım takibi yeniden hesaplanırken eşzamanlı değişiklikler devam ediyor; sonraki bakım işleminde tekrar hesaplanacak.", { engineId, typeKey });
}
