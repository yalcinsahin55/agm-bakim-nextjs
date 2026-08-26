import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

type DryRunReport = {
  scanned?: unknown;
  eligible?: unknown;
  invalid?: unknown;
  skipped?: unknown;
  total_bytes?: unknown;
  limited?: unknown;
};

const TARGET_BRANCH = "migration-dry-run";
const REPORT_PATH = "/tmp/agm-legacy-media-dry-run.json";

function isTargetPreview(): boolean {
  return process.env.VERCEL === "1"
    && process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === TARGET_BRANCH;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function main(): void {
  if (!isTargetPreview()) return;
  rmSync(REPORT_PATH, { force: true });

  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", resolve("scripts/migrate-legacy-media.mts"), `--report=${REPORT_PATH}`, "--max-changes=25"],
    { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );

  if (result.status !== 0 || !existsSync(REPORT_PATH)) {
    console.error(JSON.stringify({ migration: "legacy-media-dry-run", ok: false, reason: "dry-run failed" }));
    process.exitCode = 1;
    return;
  }

  let report: DryRunReport;
  try {
    report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as DryRunReport;
  } catch {
    console.error(JSON.stringify({ migration: "legacy-media-dry-run", ok: false, reason: "report unreadable" }));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    migration: "legacy-media-dry-run",
    ok: true,
    scanned: numeric(report.scanned),
    eligible: numeric(report.eligible),
    invalid: numeric(report.invalid),
    skipped: numeric(report.skipped),
    total_bytes: numeric(report.total_bytes),
    limited: report.limited === true,
  }));
}

main();
