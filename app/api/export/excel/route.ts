import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { buildItems, STATUS_LABELS, engineSortKey } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return new Response(JSON.stringify({ error: "Giriş gerekli" }), { status: 401 });

  const { searchParams } = new URL(req.url);
  const engineFilter = searchParams.get("engine_id");
  const typeFilter = searchParams.get("type_label");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const recordQuery: Record<string, unknown> = {};
  if (engineFilter) recordQuery.engine_id = engineFilter;
  if (typeFilter) recordQuery.type_label = typeFilter;
  if (from || to) {
    recordQuery.created_at = {
      ...(from ? { $gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { $lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }

  const allEngines = await (db.collection("engines") as any).find().toArray();
  allEngines.sort((a: any, b: any) => engineSortKey(a.name) - engineSortKey(b.name));
  const engines = engineFilter ? allEngines.filter((engine: any) => engine._id === engineFilter || engine.name === engineFilter) : allEngines;
  const types = await (db.collection("maintenance_types") as any).find().toArray();
  const items = buildItems(engines, types).filter((item: any) => !typeFilter || item.type_label === typeFilter);

  const wb = XLSX.utils.book_new();

  const engineRows = engines.map((e: any) => ({
    "MOTOR": e.name, "MOTOR ÇALIŞMA SAATİ": e.hours, "YÜK (kW)": e.load_kw || 0,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(engineRows), "Motor Saatleri");

  const summaryRows = [...items].sort((a, b) => a.remaining - b.remaining).map((i) => ({
    "MOTOR": i.engine_name, "BAKIM TÜRÜ": i.type_label, "MOTOR SAATİ": i.engine_hours,
    "SON BAKIM SAATİ": i.last_hour, "PERİYOT": i.period,
    "KALAN SAAT": Math.round(i.remaining * 10) / 10, "DURUM": STATUS_LABELS[i.status].toUpperCase(),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Bakım Özeti");

  const byType: Record<string, typeof items> = {};
  items.forEach((i) => { (byType[i.type_label] ||= []).push(i); });
  Object.entries(byType).forEach(([label, rows]) => {
    rows = rows.sort((a, b) => engineSortKey(a.engine_name) - engineSortKey(b.engine_name));
    const sheetRows = rows.map((i) => ({
      "MOTOR": i.engine_name, "MOTOR SAATİ": i.engine_hours, "SON BAKIM SAATİ": i.last_hour,
      "PERİYODİK BAKIM SAATİ": i.period, "KALAN SAAT": Math.round(i.remaining * 10) / 10,
      "DURUM": STATUS_LABELS[i.status].toUpperCase(),
    }));
    const safeName = label.replace(/[\\/?*[\]:]/g, "").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), safeName);
  });

  const history = await (db.collection("maintenance_records") as any).find(recordQuery, {
    projection: { photos_b64: 0, photos: 0, videos: 0 },
  }).sort({ created_at: -1 }).limit(5000).toArray();
  const historyRows = history.map((record: any) => ({
    "TARİH": record.created_at ? new Date(record.created_at).toLocaleDateString("tr-TR") : "",
    "MOTOR": record.engine_name || "",
    "BAKIM TÜRÜ": record.type_label || "",
    "MOTOR SAATİ": record.hour_at_completion || 0,
    "SORUMLU TEKNİSYEN": record.technician_name || "",
    "DİĞER TEKNİSYENLER": Array.isArray(record.other_technicians) ? record.other_technicians.map((technician: any) => technician.full_name).join(", ") : "",
    "NOT": record.technician_note || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyRows), "Bakım Geçmişi");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `AGM_Motor_Bakim_Raporu_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
