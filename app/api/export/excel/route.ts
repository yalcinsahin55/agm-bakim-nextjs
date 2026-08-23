import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildItems, STATUS_LABELS, engineSortKey } from "@/lib/status";
import { TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import { formatMaintenanceDuration, getMaintenanceRecordDate } from "@/lib/maintenanceTime";
import { buildMaintenanceRecordQuery } from "@/lib/reportFilterQuery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return new Response(JSON.stringify({ error: "Giriş gerekli" }), { status: 401 });
  if (!hasPermission(user.role, "reports:read")) return new Response(JSON.stringify({ error: "Rapor görme yetkiniz yok." }), { status: 403 });

  const { searchParams } = new URL(req.url);
  const engineFilter = searchParams.get("engine_id");
  const typeFilter = searchParams.get("type_label");
  const recordQuery = await buildMaintenanceRecordQuery(db, searchParams);

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
  }).sort({ maintenance_start_at: -1, created_at: -1 }).limit(5000).toArray();
  const historyRows = history.map((record: any) => ({
    "TARİH": getMaintenanceRecordDate(record.maintenance_start_at, record.created_at)?.toLocaleDateString("tr-TR") || "",
    "MOTOR": record.engine_name || "",
    "BAKIM TÜRÜ": record.type_label || "",
    "MOTOR SAATİ": record.hour_at_completion || 0,
    "BAŞLANGIÇ": record.maintenance_start_at ? new Date(record.maintenance_start_at).toLocaleString("tr-TR") : "",
    "BİTİŞ": record.maintenance_end_at ? new Date(record.maintenance_end_at).toLocaleString("tr-TR") : "",
    "TOPLAM SÜRE": formatMaintenanceDuration(record.maintenance_duration_minutes),
    "SORUMLU TEKNİSYEN": record.technician_name || "",
    "SORUMLU TEKNİSYEN TÜRÜ": TECHNICIAN_TYPE_LABELS[record.technician_type as "mekanik" | "elektromekanik"] || (record.technician_source === "external_service" ? "Dış hizmet" : "Mekanik teknisyen"),
    "DİĞER TEKNİSYENLER": Array.isArray(record.other_technicians) ? record.other_technicians.map((technician: any) => `${technician.full_name}${technician.technician_type ? ` (${TECHNICIAN_TYPE_LABELS[technician.technician_type as "mekanik" | "elektromekanik"]})` : ""}`).join(", ") : "",
    "TEKNİSYEN KATKILARI": Array.isArray(record.technician_contributions) ? record.technician_contributions.map((contribution: any) => `${contribution.full_name} · ${contribution.contribution_role === "responsible" ? "Sorumlu" : "Destek"} · ${formatMaintenanceDuration(contribution.duration_minutes)}`).join(" | ") : "",
    "NOT": record.technician_note || "",
    "YÖNETİCİ TEYİDİ": record.manager_confirmation_status === "pending" ? "Teyit bekliyor" : record.manager_confirmation_status === "confirmed" ? "Teyitli" : "Eski kayıt",
    "TEYİT EDEN YÖNETİCİ": record.manager_confirmed_by_name || "",
    "TEYİT TARİHİ": record.manager_confirmed_at ? new Date(record.manager_confirmed_at).toLocaleString("tr-TR") : "",
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
