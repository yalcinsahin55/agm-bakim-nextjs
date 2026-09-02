import type { ClientSession } from "mongodb";
import { enginesCollection } from "@/lib/dbCollections";
import type { EngineDocument } from "@/lib/dbTypes";

export async function updateEngineHoursIfAdvanced(
  db: Parameters<typeof enginesCollection>[0],
  engineId: string,
  completedHours: number,
  session?: ClientSession,
): Promise<void> {
  const options = session ? { session } : {};
  const engine = await enginesCollection(db).findOne({ _id: engineId }, options);
  if (!engine || completedHours <= Number(engine.hours || 0)) return;

  const stamp = new Date();
  const historyEntry = { date: stamp.toISOString(), hours: completedHours, load_kw: engine.load_kw || 0 };
  await enginesCollection(db).updateOne(
    { _id: engineId },
    Array.isArray(engine.history)
      ? { $set: { hours: completedHours, updated_at: stamp }, $push: { history: historyEntry } }
      : { $set: { hours: completedHours, updated_at: stamp, history: [historyEntry] } },
    options,
  );
}
