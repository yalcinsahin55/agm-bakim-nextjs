import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import process from "node:process";

type MigrationRun = {
  _id: string;
  status?: string;
  applied?: number;
  pending?: number;
  errors?: number;
};

type DryRunReport = {
  scanned?: unknown;
  eligible?: unknown;
  invalid?: unknown;
  skipped?: unknown;
  total_bytes?: unknown;
  limited?: unknown;
};

type VerificationReport = {
  migration: "legacy-media-remainder-a-verify";
  run_id: string;
  found: boolean;
  status: string | null;
  applied: number;
  pending: number;
  errors: number;
  backup_items: number;
  remaining_dry_run: {
    scanned: number;
    eligible: number;
    invalid: number;
    skipped: number;
    total_bytes: number;
    limited: boolean;
    ok: boolean;
  };
  raw_base64_logged: false;
};

const runId = "legacy-media-remainder-a-cad98b06aca7";
const reportPath = process.env.MIGRATION_REPORT_PATH || "/tmp/agm-legacy-media-remainder-a-verify.json";
const dryRunPath = "/tmp/agm-legacy-media-remainder-a-remaining-dry-run.json";

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function runRemainingDryRun(): DryRunReport | null {
  rmSync(dryRunPath, { force: true });
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", resolve("scripts/migrate-legacy-media.mts"), `--report=${dryRunPath}`, "--max-changes=13"],
    { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0 || !existsSync(dryRunPath)) return null;
  try {
    return JSON.parse(readFileSync(dryRunPath, "utf8")) as DryRunReport;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI gerekli.");
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(process.env.MONGO_DB_NAME || undefined);
    const run = await db.collection<MigrationRun>("legacy_media_migration_runs").findOne({ _id: runId }, { projection: { _id: 1, status: 1, applied: 1, pending: 1, errors: 1 } });
    const backupItems = await db.collection<{ _id: string }>("legacy_media_migration_backup_items").countDocuments({ run_id: runId });
    const remaining = runRemainingDryRun();
    const report: VerificationReport = {
      migration: "legacy-media-remainder-a-verify",
      run_id: runId,
      found: Boolean(run),
      status: run?.status || null,
      applied: typeof run?.applied === "number" ? run.applied : 0,
      pending: typeof run?.pending === "number" ? run.pending : 0,
      errors: typeof run?.errors === "number" ? run.errors : 0,
      backup_items: backupItems,
      remaining_dry_run: {
        scanned: numeric(remaining?.scanned),
        eligible: numeric(remaining?.eligible),
        invalid: numeric(remaining?.invalid),
        skipped: numeric(remaining?.skipped),
        total_bytes: numeric(remaining?.total_bytes),
        limited: remaining?.limited === true,
        ok: Boolean(remaining),
      },
      raw_base64_logged: false,
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
