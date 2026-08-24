import { enginesCollection, maintenanceTypesCollection, recordsCollection, usersCollection } from "@/lib/dbCollections";
import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildItems, STATUS_LABELS, engineSortKey } from "@/lib/status";
import { TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import { formatMaintenanceDuration, getMaintenanceRecordDate } from "@/lib/maintenanceTime";
import { buildMaintenanceRecordQuery } from "@/lib/reportFilterQuery";
import { escapeSpreadsheetRows } from "@/lib/spreadsheetSecurity";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { addRows } from "@/lib/excel";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

function uniqueSheetName(label: string, used: Set<string>): string {
  const base = label.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31) || "Bakım";
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    const suffixText = ` (${suffix})`;
    name = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  used.add(name);
  return name;
}

async function getExcelExport(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return new Response(JSON.stringify({ error: "Giriş gerekli" }), { status: 401 });
  if (!hasPermission(user.role, "reports:read")) return new Response(JSON.stringify({ error: "Rapor görme yetkiniz yok." }), { status: 403 });
  const rateLimited = await enforceApiRateLimit(req, "export-excel", 12, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(req.url);
  const engineFilter = searchParams.get("engine_id");
  const typeFilter = searchParams.get("type_label");
  const recordQuery = await buildMaintenanceRecordQuery(db, searchParams);

  const allEngines = await enginesCollection(db).find().toArray();
  allEngines.sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name));
  const engines = engineFilter ? allEngines.filter((engine) => engine._id === engineFilter || engine.name === engineFilter) : allEngines;
  const types = await maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }).toArray();
  const items = buildItems(engines, types).filter((item) => !typeFilter || item.type_label === typeFilter);

  const workbook = new ExcelJS.Workbook();
  const usedSheetNames = new Set<string>();
  const addDataSheet = (name: string, rows: Record<string, unknown>[]) => {
    const worksheet = workbook.addWorksheet(uniqueSheetName(name, usedSheetNames));
    addRows(worksheet, escapeSpreadsheetRows(rows));
  };

  const engineRows = engines.map((e) => ({
    "MOTOR": e.name, "MOTOR ÇALIŞMA SAATİ": e.hours, "YÜK (kW)": e.load_kw || 0,
  }));
  addDataSheet("Motor Saatleri", engineRows);

  const summaryRows = [...items].sort((a, b) => a.remaining - b.remaining).map((i) => ({
    "MOTOR": i.engine_name, "BAKIM TÜRÜ": i.type_label, "MOTOR SAATİ": i.engine_hours,
    "SON BAKIM SAATİ": i.last_hour, "PERİYOT": i.period,
    "KALAN SAAT": Math.round(i.remaining * 10) / 10, "DURUM": STATUS_LABELS[i.status].toUpperCase(),
  }));
  addDataSheet("Bakım Özeti", summaryRows);

  const byType: Record<string, typeof items> = {};
  items.forEach((i) => { (byType[i.type_label] ||= []).push(i); });
  Object.entries(byType).forEach(([label, rows]) => {
    rows = rows.sort((a, b) => engineSortKey(a.engine_name) - engineSortKey(b.engine_name));
    const sheetRows = rows.map((i) => ({
      "MOTOR": i.engine_name, "MOTOR SAATİ": i.engine_hours, "SON BAKIM SAATİ": i.last_hour,
      "PERİYODİK BAKIM SAATİ": i.period, "KALAN SAAT": Math.round(i.remaining * 10) / 10,
      "DURUM": STATUS_LABELS[i.status].toUpperCase(),
    }));
    addDataSheet(label, sheetRows);
  });

  const history = await recordsCollection(db).find(recordQuery, {
    projection: { photos_b64: 0, photos: 0, videos: 0 },
  }).sort({ maintenance_start_at: -1, created_at: -1 }).limit(5000).toArray();
  const historyRows = history.map((record) => ({
    "TARİH": getMaintenanceRecordDate(record.maintenance_start_at, record.created_at)?.toLocaleDateString("tr-TR") || "",
    "MOTOR": record.engine_name || "",
    "BAKIM TÜRÜ": record.type_label || "",
    "MOTOR SAATİ": record.hour_at_completion || 0,
    "BAŞLANGIÇ": record.maintenance_start_at ? new Date(record.maintenance_start_at).toLocaleString("tr-TR") : "",
    "BİTİŞ": record.maintenance_end_at ? new Date(record.maintenance_end_at).toLocaleString("tr-TR") : "",
    "TOPLAM SÜRE": formatMaintenanceDuration(record.maintenance_duration_minutes),
    "SORUMLU TEKNİSYEN": record.technician_name || "",
    "SORUMLU TEKNİSYEN TÜRÜ": TECHNICIAN_TYPE_LABELS[record.technician_type as "mekanik" | "elektromekanik"] || (record.technician_source === "external_service" ? "Dış hizmet" : "Mekanik teknisyen"),
    "DİĞER TEKNİSYENLER": Array.isArray(record.other_technicians) ? record.other_technicians.map((technician) => `${technician.full_name}${technician.technician_type ? ` (${TECHNICIAN_TYPE_LABELS[technician.technician_type as "mekanik" | "elektromekanik"]})` : ""}`).join(", ") : "",
    "TEKNİSYEN KATKILARI": Array.isArray(record.technician_contributions) ? record.technician_contributions.map((contribution) => `${contribution.full_name} · ${contribution.contribution_role === "responsible" ? "Sorumlu" : "Destek"} · ${formatMaintenanceDuration(contribution.duration_minutes)}`).join(" | ") : "",
    "NOT": record.technician_note || "",
    "YÖNETİCİ TEYİDİ": record.manager_confirmation_status === "pending" ? "Teyit bekliyor" : record.manager_confirmation_status === "confirmed" ? "Teyitli" : "Eski kayıt",
    "TEYİT EDEN YÖNETİCİ": record.manager_confirmed_by_name || "",
    "TEYİT TARİHİ": record.manager_confirmed_at ? new Date(record.manager_confirmed_at).toLocaleString("tr-TR") : "",
  }));
  addDataSheet("Bakım Geçmişi", historyRows);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `AGM_Motor_Bakim_Raporu_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(Buffer.from(buffer as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/export/excel", () => getExcelExport(req), { request: req });
}
