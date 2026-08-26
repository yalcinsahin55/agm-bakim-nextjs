import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

type ApplyReport = { applied?: unknown; pending?: unknown; errors?: unknown; run_id?: unknown };

const BATCH_BRANCH = "migration-oil-pdf-batch-a";
const REPORT_PATH = "/tmp/agm-legacy-oil-pdf-batch-a-report.json";
const BACKUP_PATH = "/tmp/agm-legacy-oil-pdf-batch-a-backup.json";

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function safeDeploymentId(): string {
  return (process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "manual").replace(/[^A-Za-z0-9_-]/g, "_");
}
function main(): void {
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== BATCH_BRANCH) return;
  rmSync(REPORT_PATH, { force: true });
  rmSync(BACKUP_PATH, { force: true });
  const runId = `legacy-oil-pdf-batch-a-${safeDeploymentId()}`;
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      resolve("scripts/migrate-legacy-oil-pdfs.mts"),
      "--apply",
      "--confirm=APPLY-LEGACY-OIL-PDFS",
      "--max-changes=6",
      "--offset=0",
      `--run-id=${runId}`,
      `--report=${REPORT_PATH}`,
      `--backup=${BACKUP_PATH}`,
    ],
    { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0 || !existsSync(REPORT_PATH)) {
    console.error(JSON.stringify({ migration: "legacy-oil-pdfs", mode: "apply", ok: false, batch: "A", run_id: runId, reason: "batch apply failed" }));
    process.exitCode = 1;
    return;
  }
  try {
    const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as ApplyReport;
    const applied = numeric(report.applied);
    const pending = numeric(report.pending);
    const errors = numeric(report.errors);
    console.log(JSON.stringify({ migration: "legacy-oil-pdfs", mode: "apply", ok: applied === 6 && pending === 0 && errors === 0, batch: "A", run_id: typeof report.run_id === "string" ? report.run_id : runId, applied, pending, errors }));
    if (applied !== 6 || pending !== 0 || errors !== 0) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ migration: "legacy-oil-pdfs", mode: "apply", ok: false, batch: "A", run_id: runId, reason: "batch report unreadable" }));
    process.exitCode = 1;
  }
}
main();
