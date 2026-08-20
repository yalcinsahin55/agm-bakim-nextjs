import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users"));
  if (!user || user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }

  const results = [];
  async function idx(col, spec, name) {
    try {
      await db.collection(col).createIndex(spec, { name });
      results.push({ col, name, ok: true });
    } catch (e) {
      results.push({ col, name, ok: false, error: e.message });
    }
  }

  await idx("records", { engine_id: 1, created_at: -1 }, "idx_records_engine_date");
  await idx("records", { type_label: 1, created_at: -1 }, "idx_records_type_date");
  await idx("records", { group_id: 1 }, "idx_records_group");
  await idx("pressure_readings", { engine_id: 1, reading_date: 1 }, "idx_pressure_engine_date");
  await idx("oil_analyses", { engine_id: 1, analysis_date: -1 }, "idx_oil_engine_date");
  await idx("engines", { name: 1 }, "idx_engines_name");

  return NextResponse.json({ ok: true, results });
}
