import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

type DryRunReport = {
  mode?: unknown;
  scanned?: unknown;
  eligible?: unknown;
  invalid?: unknown;
  skipped?: unknown;
  total_bytes?: unknown;
  limited?: unknown;
  applied?: unknown;
  pending?: unknown;
  errors?: unknown;
};

type BackupSummary = { errors?: Array<{ error?: unknown }> };

const DRY_RUN_BRANCH = "migration-dry-run";
const PILOT_BRANCH = "migration-pilot";
const REPORT_PATH = "/tmp/agm-legacy-media-migration.json";
const BACKUP_PATH = "/tmp/agm-legacy-media-pilot-backup.json";

function modeForBuild(): "dry-run" | "apply" | null {
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview") return null;
  if (process.env.VERCEL_GIT_COMMIT_REF === DRY_RUN_BRANCH) return "dry-run";
  if (process.env.VERCEL_GIT_COMMIT_REF === PILOT_BRANCH) return "apply";
  return null;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function main(): void {
  const mode = modeForBuild();
  if (!mode) return;
  rmSync(REPORT_PATH, { force: true });
  rmSync(BACKUP_PATH, { force: true });

  const runId = `legacy-media-pilot-${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "unknown"}`;
  const args = [
    "--experimental-strip-types",
    resolve("scripts/migrate-legacy-media.mts"),
    `--report=${REPORT_PATH}`,
    "--max-changes=5",
    ...(mode === "apply" ? [
      "--apply",
      "--confirm=APPLY-LEGACY-MEDIA-MIGRATION",
      `--backup=${BACKUP_PATH}`,
      `--run-id=${runId}`,
    ] : []),
  ];
  const result = spawnSync(process.execPath, args, { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

  if (result.status !== 0 || !existsSync(REPORT_PATH)) {
    console.error(JSON.stringify({ migration: "legacy-media", mode, ok: false, reason: mode === "apply" ? "pilot apply failed" : "dry-run failed" }));
    process.exitCode = 1;
    return;
  }

  let report: DryRunReport;
  let backup: BackupSummary = {};
  try {
    report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as DryRunReport;
    if (mode === "apply" && existsSync(BACKUP_PATH)) backup = JSON.parse(readFileSync(BACKUP_PATH, "utf8")) as BackupSummary;
  } catch {
    console.error(JSON.stringify({ migration: "legacy-media", mode, ok: false, reason: "report unreadable" }));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    migration: "legacy-media",
    mode,
    ok: true,
    run_id: mode === "apply" ? runId : undefined,
    scanned: numeric(report.scanned),
    eligible: numeric(report.eligible),
    invalid: numeric(report.invalid),
    skipped: numeric(report.skipped),
    total_bytes: numeric(report.total_bytes),
    limited: report.limited === true,
    applied: numeric(report.applied),
    pending: numeric(report.pending),
    errors: numeric(report.errors),
    error_messages: mode === "apply" ? (backup.errors || []).slice(0, 5).map((item) => String(item.error || "unknown").replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[redacted-mongo-uri]").replace(/https?:\/\/\S+/gi, "[redacted-url]").replace(/\b[A-Za-z0-9+/]{100,}={0,2}\b/g, "[redacted-base64]").slice(0, 240)) : undefined,
  }));
}

main();
