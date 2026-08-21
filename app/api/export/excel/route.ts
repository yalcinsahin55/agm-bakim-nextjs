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

  const engines = await (db.collection("engines") as any).find().toArray();
  engines.sort((a: any, b: any) => engineSortKey(a.name) - engineSortKey(b.name));
  const types = await (db.collection("maintenance_types") as any).find().toArray();
  const items = buildItems(engines, types);

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
