import { MongoClient } from "mongodb";
import { writeFileSync } from "node:fs";
import process from "node:process";

type MigrationRun = {
  _id: string;
  status?: string;
  applied?: number;
  pending?: number;
  errors?: number;
};

type VerificationReport = {
  migration: "legacy-media-verify";
  run_id: string;
  found: boolean;
  status: string | null;
  applied: number;
  pending: number;
  errors: number;
  backup_items: number;
  raw_base64_examined: false;
};

const runId = "legacy-media-pilot-6914a0cf0028";
const reportPath = process.env.MIGRATION_REPORT_PATH || "/tmp/agm-legacy-media-verify.json";

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI gerekli.");
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(process.env.MONGO_DB_NAME || undefined);
    const run = await db.collection<MigrationRun>("legacy_media_migration_runs").findOne({ _id: runId }, { projection: { _id: 1, status: 1, applied: 1, pending: 1, errors: 1 } });
    const backupItems = await db.collection<{ _id: string }>("legacy_media_migration_backup_items").countDocuments({ run_id: runId });
    const report: VerificationReport = {
      migration: "legacy-media-verify",
      run_id: runId,
      found: Boolean(run),
      status: run?.status || null,
      applied: typeof run?.applied === "number" ? run.applied : 0,
      pending: typeof run?.pending === "number" ? run.pending : 0,
      errors: typeof run?.errors === "number" ? run.errors : 0,
      backup_items: backupItems,
      raw_base64_examined: false,
    };
    writeFileSync(reportPath, JSON.stringify(report));
    console.log(JSON.stringify(report));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Legacy media verification failed");
  process.exitCode = 1;
});
