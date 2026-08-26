import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

type Sample = {
  id?: unknown;
  photos?: unknown;
  videos?: unknown;
  bytes?: unknown;
  invalid?: unknown;
  eligible?: unknown;
};

type DryRunReport = {
  scanned?: unknown;
  eligible?: unknown;
  invalid?: unknown;
  skipped?: unknown;
  total_bytes?: unknown;
  limited?: unknown;
  samples?: Sample[];
};

const TARGET_BRANCH = "migration-remainder-dry-run";
const REPORT_PATH = "/tmp/agm-legacy-media-remainder-dry-run.json";

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function main(): void {
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== TARGET_BRANCH) return;
  rmSync(REPORT_PATH, { force: true });
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", resolve("scripts/migrate-legacy-media.mts"), `--report=${REPORT_PATH}`, "--max-changes=13"],
    { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0 || !existsSync(REPORT_PATH)) {
    console.error(JSON.stringify({ migration: "legacy-media-remainder-dry-run", ok: false, reason: "dry-run failed" }));
    process.exitCode = 1;
    return;
  }
  try {
    const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as DryRunReport;
    const samples = Array.isArray(report.samples) ? report.samples : [];
    console.log(JSON.stringify({
      migration: "legacy-media-remainder-dry-run",
      ok: true,
      scanned: numeric(report.scanned),
      eligible: numeric(report.eligible),
      invalid: numeric(report.invalid),
      skipped: numeric(report.skipped),
      total_bytes: numeric(report.total_bytes),
      limited: report.limited === true,
      max_changes: 13,
      sample_summary: samples.slice(0, 13).map((sample) => ({
        id: typeof sample.id === "object" && sample.id !== null ? "serialized-id" : typeof sample.id === "string" ? sample.id.slice(0, 80) : "unknown",
        photos: numeric(sample.photos),
        videos: numeric(sample.videos),
        bytes: numeric(sample.bytes),
        invalid: sample.invalid === true,
        eligible: sample.eligible === true,
      })),
      raw_base64_logged: false,
    }));
  } catch {
    console.error(JSON.stringify({ migration: "legacy-media-remainder-dry-run", ok: false, reason: "report unreadable" }));
    process.exitCode = 1;
  }
}

main();
