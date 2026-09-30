import type { ClientSession, Db } from "mongodb";
import type { EngineHistoryEntry } from "@/lib/types";
import { engineHourSnapshotsCollection } from "@/lib/dbCollections";

export type EngineHistorySource = EngineHistoryEntry & { engine_id?: string };

function options(session?: ClientSession) {
  return session ? { session } : {};
}

function normalizeEntry(entry: Partial<EngineHistoryEntry>): EngineHistoryEntry | null {
  const date = typeof entry.date === "string" ? entry.date : "";
  const hours = Number(entry.hours);
  if (!date || !Number.isFinite(new Date(date).getTime()) || !Number.isFinite(hours)) return null;
  return {
    date,
    hours,
    load_kw: Number.isFinite(Number(entry.load_kw)) ? Number(entry.load_kw) : 0,
    ...(entry.source ? { source: entry.source } : {}),
  };
}

export async function readEngineHistory(
  db: Db,
  engineId: string,
  legacyHistory?: readonly EngineHistoryEntry[],
  session?: ClientSession,
): Promise<EngineHistoryEntry[]> {
  const snapshots = await engineHourSnapshotsCollection(db)
    .find({ engine_id: engineId }, { projection: { _id: 0, engine_id: 0 }, sort: { date: 1, _id: 1 }, ...options(session) })
    .toArray();
  if (snapshots.length > 0) return snapshots.map((entry) => normalizeEntry(entry)).filter((entry): entry is EngineHistoryEntry => Boolean(entry));
  return (Array.isArray(legacyHistory) ? legacyHistory : [])
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is EngineHistoryEntry => Boolean(entry))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function appendEngineHistoryEntry(
  db: Db,
  engineId: string,
  entry: EngineHistoryEntry,
  session?: ClientSession,
): Promise<void> {
  await engineHourSnapshotsCollection(db).insertOne(
    { engine_id: engineId, ...entry, created_at: new Date() },
    options(session),
  );
}

export async function replaceEngineHistory(
  db: Db,
  engineId: string,
  history: readonly EngineHistoryEntry[],
  session?: ClientSession,
): Promise<void> {
  const collection = engineHourSnapshotsCollection(db);
  await collection.deleteMany({ engine_id: engineId }, options(session));
  const entries = history.map((entry) => ({ engine_id: engineId, ...entry, created_at: new Date() }));
  if (entries.length > 0) await collection.insertMany(entries, options(session));
}
