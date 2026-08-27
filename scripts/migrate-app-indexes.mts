import { getMongoClient, getDb } from "../lib/mongodb.ts";
import { ensureAppIndexes } from "../lib/dbIndexes.ts";

const EXPECTED_NAMED_INDEXES: Readonly<Record<string, readonly string[]>> = {
  maintenance_records: [
    "records_engine_created_at",
    "records_created_at_id_desc",
    "records_engine_type_created_at",
    "records_engine_type_hour_desc",
    "records_maintenance_date_desc",
    "records_engine_maintenance_date_desc",
    "records_type_maintenance_date_desc",
    "records_confirmation_maintenance_date_desc",
    "records_technician_created_at",
    "records_technician_source_id_created_at",
    "records_photos_media_url",
    "records_videos_legacy_media_url",
    "records_videos_url_media_url",
    "records_manager_confirmation_created_at",
    "records_group_confirmation_status",
  ],
  notifications: ["notifications_user_sort_at_desc"],
  users: ["users_phone_normalized_unique", "users_stable_id_unique", "users_first_bootstrap_unique", "users_technician_lookup"],
  engines: ["engines_stable_id_unique"],
  equipment_info: ["equipment_info_stable_id_unique"],
  video_chunks: ["video_chunks_upload_index", "video_chunks_owner_upload_index", "video_chunks_at_ttl"],
  oil_analyses: ["oil_analyses_engine_date_desc", "oil_analyses_date_desc"],
  pressure_readings: ["pressure_readings_engine_date_asc", "pressure_readings_date_asc"],
};

const dryRun = process.argv.includes("--dry-run") || process.env.INDEX_MIGRATION_DRY_RUN === "1";

async function listMissingIndexes(db: Awaited<ReturnType<typeof getDb>>): Promise<Array<{ collection: string; index: string }>> {
  const missing: Array<{ collection: string; index: string }> = [];
  for (const [collectionName, expectedNames] of Object.entries(EXPECTED_NAMED_INDEXES)) {
    const indexes = await db.collection(collectionName).listIndexes().toArray();
    const actualNames = new Set(indexes.map((index) => typeof index.name === "string" ? index.name : ""));
    for (const name of expectedNames) if (!actualNames.has(name)) missing.push({ collection: collectionName, index: name });
  }
  return missing;
}

async function main(): Promise<void> {
  const db = await getDb();
  const before = await listMissingIndexes(db);
  if (!dryRun) await ensureAppIndexes(db);
  const after = await listMissingIndexes(db);
  const result = {
    ok: after.length === 0,
    mode: dryRun ? "dry-run" : "apply",
    database: db.databaseName,
    before_missing: before.length,
    after_missing: after.length,
    missing: after,
  };
  console.log(JSON.stringify(result));
  if (after.length > 0) throw new Error(`${after.length} beklenen index doğrulanamadı.`);
}

try {
  await main();
} finally {
  const client = await getMongoClient().catch(() => null);
  if (client) await client.close();
}
