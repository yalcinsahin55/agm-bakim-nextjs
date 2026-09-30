#!/usr/bin/env node
import { getMongoClient } from "../lib/mongodb.ts";
import { engineHourSnapshotsCollection } from "../lib/dbCollections.ts";
import type { EngineDocument } from "../lib/dbTypes.ts";

const APPLY_CONFIRM = "APPLY-ENGINE-HOUR-HISTORY-MIGRATION";
const DROP_CONFIRM = "DROP-LEGACY-ENGINE-HISTORY";
const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
const dropLegacy = process.argv.includes("--drop-legacy") && process.argv.includes(`--confirm=${DROP_CONFIRM}`);

async function main(): Promise<void> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_NAME || "agm_bakim");
  const engines = db.collection<EngineDocument>("engines");
  const snapshots = engineHourSnapshotsCollection(db);
  const existing = await snapshots.countDocuments();
  const report = { mode: dryRun ? "dry-run" : "apply", engines: 0, legacy_entries: 0, inserted: 0, already_present: existing, dropped_legacy: false };

  for await (const engine of engines.find({}, { projection: { _id: 1, history: 1 } })) {
    report.engines += 1;
    const history = Array.isArray(engine.history) ? engine.history : [];
    report.legacy_entries += history.length;
    if (dryRun || history.length === 0) continue;
    const engineId = String(engine._id);
    const currentCount = await snapshots.countDocuments({ engine_id: engineId });
    if (currentCount === 0) {
      const entries = history
        .filter((entry) => typeof entry.date === "string" && Number.isFinite(new Date(entry.date).getTime()) && Number.isFinite(Number(entry.hours)))
        .map((entry) => ({ engine_id: engineId, date: entry.date, hours: Number(entry.hours), load_kw: Number(entry.load_kw || 0), source: entry.source, created_at: new Date() }));
      if (entries.length > 0) {
        await snapshots.insertMany(entries);
        report.inserted += entries.length;
      }
    }
    if (dropLegacy) {
      await engines.updateOne({ _id: engine._id }, { $unset: { history: "" } });
      report.dropped_legacy = true;
    }
  }
  if (!dryRun && !dropLegacy && process.argv.includes("--drop-legacy")) {
    throw new Error(`Legacy history silmek için --confirm=${DROP_CONFIRM} gereklidir.`);
  }
  console.log(JSON.stringify(report));
}

try {
  if (!dryRun && !process.argv.includes(`--confirm=${APPLY_CONFIRM}`)) throw new Error(`Apply için --confirm=${APPLY_CONFIRM} gereklidir.`);
  await main();
} finally {
  const client = await getMongoClient().catch(() => null);
  if (client) await client.close();
}
