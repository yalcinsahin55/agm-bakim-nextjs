import type { ClientSession } from "mongodb";
import { enginesCollection } from "@/lib/dbCollections";
import { appendEngineHistoryEntry } from "@/lib/engineHistory";

export async function updateEngineHoursIfAdvanced(
  db: Parameters<typeof enginesCollection>[0],
  engineId: string,
  completedHours: number,
  eventDate?: string | Date | null,
  session?: ClientSession,
  fallbackDate?: string | Date,
): Promise<void> {
  const options = session ? { session } : {};
  const engine = await enginesCollection(db).findOne({ _id: engineId }, options);
  if (!engine || completedHours <= Number(engine.hours || 0)) return;

  const stamp = new Date();
  const candidateDate = eventDate || fallbackDate;
  const historyDate = candidateDate && !Number.isNaN(new Date(candidateDate).getTime()) ? new Date(candidateDate).toISOString() : stamp.toISOString();
  const historyEntry = { date: historyDate, hours: completedHours, load_kw: engine.load_kw || 0, source: "record" as const };
  await enginesCollection(db).updateOne(
    { _id: engineId },
    { $set: { hours: completedHours, updated_at: stamp } },
    options,
  );
  await appendEngineHistoryEntry(db, engineId, historyEntry, session);
}
