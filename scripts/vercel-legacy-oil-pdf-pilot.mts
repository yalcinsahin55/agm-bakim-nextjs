import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

type ApplyReport = {
  applied?: unknown;
  pending?: unknown;
  errors?: unknown;
  run_id?: unknown;
};

const PILOT_BRANCH = "migration-oil-pdf-pilot";
const REPORT_PATH = "/tmp/agm-legacy-oil-pdf-pilot-report.json";
const BACKUP_PATH = "/tmp/agm-legacy-oil-pdf-pilot-backup.json";

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeDeploymentId(): string {
  return (process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "manual").replace(/[^A-Za-z0-9_-]/g, "_");
}

function main(): void {
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) return;
  rmSync(REPORT_PATH, { force: true });
  rmSync(BACKUP_PATH, { force: true });
  const runId = `legacy-oil-pdf-pilot-${safeDeploymentId()}`;
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      resolve("scripts/migrate-legacy-oil-pdfs.mts"),
      "--apply",
      "--confirm=APPLY-LEGACY-OIL-PDFS",
      "--max-changes=3",
      "--offset=0",
      `--run-id=${runId}`,
      `--report=${REPORT_PATH}`,
      `--backup=${BACKUP_PATH}`,
    ],
    { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0 || !existsSync(REPORT_PATH)) {
    console.error(JSON.stringify({ migration: "legacy-oil-pdfs", mode: "apply", ok: false, run_id: runId, reason: "pilot apply failed" }));
    process.exitCode = 1;
    return;
  }
  try {
    const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as ApplyReport;
    console.log(JSON.stringify({
      migration: "legacy-oil-pdfs",
      mode: "apply",
      ok: numeric(report.errors) === 0 && numeric(report.pending) === 0,
      run_id: typeof report.run_id === "string" ? report.run_id : runId,
      applied: numeric(report.applied),
      pending: numeric(report.pending),
      errors: numeric(report.errors),
    }));
    if (numeric(report.errors) !== 0 || numeric(report.pending) !== 0) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ migration: "legacy-oil-pdfs", mode: "apply", ok: false, run_id: runId, reason: "pilot report unreadable" }));
    process.exitCode = 1;
  }
}
main();
