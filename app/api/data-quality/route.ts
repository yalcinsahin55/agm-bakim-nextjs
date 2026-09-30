import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { engineHourSnapshotsCollection, enginesCollection, recordsCollection, usersCollection } from "@/lib/dbCollections";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Bu sayfa yalnızca yöneticilere açıktır." }, { status: 403 });
  const limited = await enforceApiRateLimit(req, "data-quality-read", 30, 10 * 60 * 1000, user._id);
  if (limited) return limited;

  const [engines, recordIssues, duplicateSnapshots] = await Promise.all([
    enginesCollection(db).find({}, { projection: { _id: 1, name: 1, hours: 1 } }).toArray(),
    recordsCollection(db).find({}, { projection: { _id: 1, engine_id: 1, type_key: 1, type_label: 1, hour_at_completion: 1, created_at: 1 }, sort: { created_at: -1 }, limit: 500 }).toArray(),
    engineHourSnapshotsCollection(db).aggregate([
      { $group: { _id: { engine_id: "$engine_id", date: "$date", source: "$source" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 100 },
    ]).toArray(),
  ]);

  const engineIds = new Set(engines.map((engine) => String(engine._id)));
  const invalidRecordRows = recordIssues.filter((record) => !record.engine_id || !record.type_key || typeof record.hour_at_completion !== "number" || !Number.isFinite(Number(record.hour_at_completion))).slice(0, 100);
  const orphanSnapshots = await engineHourSnapshotsCollection(db).countDocuments({ engine_id: { $nin: [...engineIds] } });
  const invalidEngines = engines.filter((engine) => !Number.isFinite(Number(engine.hours)) || Number(engine.hours) < 0).map((engine) => ({ id: String(engine._id), name: engine.name, hours: engine.hours }));
  const issues = [
    { key: "invalid-engines", label: "Geçersiz motor saati", count: invalidEngines.length, severity: "high", rows: invalidEngines },
    { key: "record-fields", label: "Eksik bakım kayıt alanı", count: invalidRecordRows.length, severity: "high", rows: invalidRecordRows },
    { key: "orphan-snapshots", label: "Motorsuz saat snapshot’ı", count: orphanSnapshots, severity: "medium", rows: [] },
    { key: "duplicate-snapshots", label: "Tekrarlanan saat snapshot’ı", count: duplicateSnapshots.length, severity: "medium", rows: duplicateSnapshots },
  ];
  return NextResponse.json({ generated_at: new Date().toISOString(), total_issues: issues.reduce((sum, issue) => sum + issue.count, 0), issues });
}
