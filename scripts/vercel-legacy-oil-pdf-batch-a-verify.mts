import { get } from "@vercel/blob";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MongoClient, ObjectId } from "mongodb";
import process from "node:process";

type NumericReport = { scanned?: unknown; eligible?: unknown; invalid?: unknown; skipped?: unknown; total_bytes?: unknown; limited?: unknown };
type RunDocument = { _id: string; status?: string; applied?: number; pending?: number; errors?: number };
type BackupItem = { _id: string; id?: string; state?: string; uploadedUrls?: unknown };
type OilDocument = { _id: ObjectId | string; pdf_url?: unknown; pdf_b64?: unknown };

const VERIFY_BRANCH = "migration-oil-pdf-batch-a-verify";
const RUN_ID = "legacy-oil-pdf-batch-a-dpl_GX6EN1sX4PkUuy4YPMZSjnqE7Knh";
const REPORT_PATH = "/tmp/agm-legacy-oil-pdf-batch-a-verify-dry-run.json";

function numeric(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function idFilter(value: string): ObjectId | string { return ObjectId.isValid(value) ? new ObjectId(value) : value; }
function blobCredentials(): { token?: string; storeId?: string } {
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN;
  const storeId = process.env.BLOB_STORE_ID || process.env.MEDIA_STORE_ID;
  return { ...(token ? { token } : {}), ...(storeId ? { storeId } : {}) };
}
function runDryRun(): NumericReport | null {
  rmSync(REPORT_PATH, { force: true });
  const child = spawnSync(process.execPath, ["--experimental-strip-types", resolve("scripts/migrate-legacy-oil-pdfs.mts"), `--report=${REPORT_PATH}`, "--max-changes=100"], { env: process.env, encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] });
  if (child.status !== 0 || !existsSync(REPORT_PATH)) return null;
  try { return JSON.parse(readFileSync(REPORT_PATH, "utf8")) as NumericReport; } catch { return null; }
}
async function main(): Promise<void> {
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== VERIFY_BRANCH) return;
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error(JSON.stringify({ migration: "legacy-oil-pdfs", mode: "verify", ok: false, reason: "MONGO_URI missing" })); process.exitCode = 1; return; }
  const client = new MongoClient(uri, { maxPoolSize: 4, serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB_NAME || undefined);
    const run = await db.collection<RunDocument>("legacy_oil_pdf_migration_runs").findOne({ _id: RUN_ID });
    const items = await db.collection<BackupItem>("legacy_oil_pdf_migration_backup_items").find({ run_id: RUN_ID } as Record<string, unknown>).toArray();
    const oilIds = items.map((item) => item.id).filter((id): id is string => typeof id === "string");
    const documents = oilIds.length > 0 ? await db.collection<OilDocument>("oil_analyses").find({ _id: { $in: oilIds.map(idFilter) } }).project({ _id: 1, pdf_url: 1, pdf_b64: 1 }).toArray() : [];
    let blobReachable = 0;
    for (const item of items) {
      const urls = Array.isArray(item.uploadedUrls) ? item.uploadedUrls.filter((value): value is string => typeof value === "string") : [];
      for (const url of urls) {
        try { const result = await get(url, { access: "private", ...blobCredentials(), abortSignal: AbortSignal.timeout(20_000) }); if (result?.statusCode === 200) blobReachable += 1; } catch { /* Aggregate-only verification. */ }
      }
    }
    const referencesReady = documents.filter((document) => typeof document.pdf_url === "string" && document.pdf_url.length > 0 && !("pdf_b64" in document)).length;
    const dryRun = runDryRun();
    const ok = Boolean(run && run.status === "completed" && numeric(run.applied) === 6 && numeric(run.pending) === 0 && numeric(run.errors) === 0 && items.length === 6 && blobReachable === 6 && referencesReady === 6 && dryRun && numeric(dryRun.eligible) === 6 && numeric(dryRun.invalid) === 0 && dryRun.limited !== true);
    console.log(JSON.stringify({ migration: "legacy-oil-pdfs", mode: "verify", ok, run_status: run?.status || "missing", applied: numeric(run?.applied), pending: numeric(run?.pending), errors: numeric(run?.errors), backup_items: items.length, blob_reachable: blobReachable, references_ready: referencesReady, remaining_scanned: numeric(dryRun?.scanned), remaining_eligible: numeric(dryRun?.eligible), remaining_invalid: numeric(dryRun?.invalid), remaining_total_bytes: numeric(dryRun?.total_bytes), remaining_limited: dryRun?.limited === true }));
    if (!ok) process.exitCode = 1;
  } finally { await client.close(); }
}
main().catch(() => { console.error(JSON.stringify({ migration: "legacy-oil-pdfs", mode: "verify", ok: false, reason: "verification failed" })); process.exitCode = 1; });
