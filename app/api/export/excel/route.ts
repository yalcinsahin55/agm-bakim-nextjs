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
import { buildForecastExportContext, forecastExportTitle, type ForecastExportContext } from "@/lib/forecastExport";
import { loadDefaultExportLogo } from "@/lib/exportBranding";

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

async function createForecastExcel(context: ForecastExportContext): Promise<Response> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AGM Bakım Merkezi";
  workbook.created = new Date();
  const defaultLogo = loadDefaultExportLogo();
  const logoId = defaultLogo ? workbook.addImage({ base64: defaultLogo.buffer.toString("base64"), extension: defaultLogo.extension }) : null;
  const usedSheetNames = new Set<string>();
  const addDataSheet = (name: string, rows: Record<string, unknown>[]) => {
    const worksheet = workbook.addWorksheet(uniqueSheetName(name, usedSheetNames));
    addRows(worksheet, escapeSpreadsheetRows(rows));
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + Math.min(26, Object.keys(rows[0] || {}).length))}${Math.max(1, rows.length + 1)}` };
    return worksheet;
  };

  const summary = context.summary;
  const summarySheet = addDataSheet("Rapor Özeti", [
    { "ALAN": "Rapor", "DEĞER": forecastExportTitle(context) },
    { "ALAN": "Marka", "DEĞER": "Yeşil Global Enerji · AGM Bakım Merkezi" },
    { "ALAN": "Rapor tarihi", "DEĞER": new Date().toLocaleDateString("tr-TR") },
    { "ALAN": "Hesaplama tarihi", "DEĞER": summary.current_date },
    { "ALAN": "Hedef yıl", "DEĞER": context.targetYear || "Belirtilmedi" },
    { "ALAN": "Periyot filtresi", "DEĞER": context.periodHours ? `${context.periodHours.toLocaleString("tr-TR")} saat` : "Tümü" },
    { "ALAN": "Toplam satır", "DEĞER": summary.total },
    { "ALAN": "Tamamlanmamış/gecikmiş", "DEĞER": summary.overdue_count },
    { "ALAN": "Aktif tahmini plan", "DEĞER": summary.scheduled_count },
    { "ALAN": "Hedef yıldan önce", "DEĞER": summary.before_target_year_count },
    { "ALAN": "Hedef yıl içi", "DEĞER": summary.target_year_count },
    { "ALAN": "Hariç tutulan bakım türleri", "DEĞER": context.excludedTypeLabels.length ? context.excludedTypeLabels.join(", ") : "Yok" },
    { "ALAN": "Hesaplama varsayımı", "DEĞER": "Motor günde 24 saat çalışır; kalan saat / 24 = yaklaşık gün" },
  ]);
  if (logoId !== null) summarySheet.addImage(logoId, { tl: { col: 3, row: 0 }, ext: { width: 180, height: 27 } });

  addDataSheet("Tahmini Bakım Planı", context.rows.map((row) => ({
    "MOTOR": row.engine,
    "BAKIM TÜRÜ": row.type,
    "PERİYOT SAATİ": row.period_hours,
    "MOTOR SAATİ": row.current_hours,
    "SON BAKIM SAATİ": row.last_maintenance_hours,
    "KALAN SAAT": row.category === "overdue" ? 0 : row.remaining_hours,
    "GECİKME SAATİ": row.overdue_hours,
    "TAHMİNİ TARİH": row.category === "overdue" ? "Tamamlanmamış" : row.estimated_date_label,
    "TAHMİN YILI": row.forecast_year,
    "DURUM": row.category === "overdue" ? "Tamamlanmamış" : row.category === "before_target_year" ? "Hedef yıldan önce" : row.category === "target_year" ? "Hedef yıl" : "Tahmini plan",
    "GÜNCEL DURUM": row.status_label,
  })));

  addDataSheet("Periyot Özeti", summary.grouped_by_period.map((group) => ({
    "PERİYOT SAATİ": group.period_hours,
    "BAKIM SAYISI": group.count,
  })));

  const buffer = await workbook.xlsx.writeBuffer();
  const suffix = context.periodHours ? `${context.periodHours}h` : context.targetYear ? String(context.targetYear) : "plan";
  const filename = `AGM_Bakim_Tahmin_Plani_${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

async function getExcelExport(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return new Response(JSON.stringify({ error: "Giriş gerekli" }), { status: 401 });
  if (!hasPermission(user.role, "reports:read")) return new Response(JSON.stringify({ error: "Rapor görme yetkiniz yok." }), { status: 403 });
  const rateLimited = await enforceApiRateLimit(req, "export-excel", 12, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(req.url);
  if (searchParams.get("forecast") === "1") {
    return createForecastExcel(await buildForecastExportContext(db, searchParams));
  }
  const engineFilter = searchParams.get("engine_id")?.trim() || null;
  const typeFilter = searchParams.get("type_label");
  const recordQuery = await buildMaintenanceRecordQuery(db, searchParams);

  const engineQuery = engineFilter ? { $or: [{ _id: engineFilter }, { name: engineFilter }] } : {};
  const engines = await enginesCollection(db).find(engineQuery, {
    projection: { _id: 1, name: 1, hours: 1, load_kw: 1 },
  }).toArray();
  engines.sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name));
  const types = await maintenanceTypesCollection(db).find(
    { is_deleted: { $ne: true } },
    { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, engine_states: 1 } },
  ).toArray();
  const items = buildItems(engines, types).filter((item) => !typeFilter || item.type_label === typeFilter);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AGM Bakım Merkezi";
  workbook.created = new Date();
  const defaultLogo = loadDefaultExportLogo();
  const logoId = defaultLogo ? workbook.addImage({ base64: defaultLogo.buffer.toString("base64"), extension: defaultLogo.extension }) : null;
  const usedSheetNames = new Set<string>();
  const addDataSheet = (name: string, rows: Record<string, unknown>[]) => {
    const worksheet = workbook.addWorksheet(uniqueSheetName(name, usedSheetNames));
    addRows(worksheet, escapeSpreadsheetRows(rows));
    return worksheet;
  };

  const summarySheet = addDataSheet("Rapor Özeti", [
    { "ALAN": "Rapor", "DEĞER": "AGM Motor Bakım Raporu" },
    { "ALAN": "Marka", "DEĞER": "Yeşil Global Enerji · AGM Bakım Merkezi" },
    { "ALAN": "Rapor tarihi", "DEĞER": new Date().toLocaleDateString("tr-TR") },
    { "ALAN": "Motor filtresi", "DEĞER": engineFilter || "Tümü" },
    { "ALAN": "Bakım türü filtresi", "DEĞER": typeFilter || "Tümü" },
  ]);
  if (logoId !== null) summarySheet.addImage(logoId, { tl: { col: 3, row: 0 }, ext: { width: 180, height: 27 } });

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
  const seenHistoryGroups = new Set<string>();
  const historyRows = history.map((record) => {
    const groupKey = String(record.group_id || record._id);
    const isFirstGroupRow = !seenHistoryGroups.has(groupKey);
    seenHistoryGroups.add(groupKey);
    return {
      "TARİH": getMaintenanceRecordDate(record.maintenance_start_at, record.created_at)?.toLocaleDateString("tr-TR") || "",
      "MOTOR": record.engine_name || "",
      "BAKIM TÜRÜ": record.type_label || "",
      "MOTOR SAATİ": record.hour_at_completion || 0,
      "BAŞLANGIÇ": record.maintenance_start_at ? new Date(record.maintenance_start_at).toLocaleString("tr-TR") : "",
      "BİTİŞ": record.maintenance_end_at ? new Date(record.maintenance_end_at).toLocaleString("tr-TR") : "",
      "ORTAK BAKIM OLAYI": isFirstGroupRow ? "İlk satır · ortak süre" : "Aynı grouped olay",
      "TOPLAM SÜRE": isFirstGroupRow ? formatMaintenanceDuration(record.maintenance_duration_minutes) : "Yukarıdaki ilk satırda",
      "SORUMLU TEKNİSYEN": record.technician_name || "",
      "SORUMLU TEKNİSYEN TÜRÜ": TECHNICIAN_TYPE_LABELS[record.technician_type as "mekanik" | "elektromekanik"] || (record.technician_source === "external_service" ? "Dış hizmet" : "Mekanik teknisyen"),
      "DİĞER TEKNİSYENLER": isFirstGroupRow && Array.isArray(record.other_technicians) ? record.other_technicians.map((technician) => `${technician.full_name}${technician.technician_type ? ` (${TECHNICIAN_TYPE_LABELS[technician.technician_type as "mekanik" | "elektromekanik"]})` : ""}`).join(", ") : isFirstGroupRow ? "" : "Aynı grouped olay",
      "TEKNİSYEN KATKILARI": isFirstGroupRow && Array.isArray(record.technician_contributions) ? record.technician_contributions.map((contribution) => `${contribution.full_name} · ${contribution.contribution_role === "responsible" ? "Sorumlu" : "Destek"} · ${formatMaintenanceDuration(contribution.duration_minutes)}`).join(" | ") : isFirstGroupRow ? "" : "Aynı ortak katkı",
      "NOT": record.technician_note || "",
      "YÖNETİCİ TEYİDİ": record.manager_confirmation_status === "pending" ? "Teyit bekliyor" : record.manager_confirmation_status === "confirmed" ? "Teyitli" : "Eski kayıt",
      "TEYİT EDEN YÖNETİCİ": record.manager_confirmed_by_name || "",
      "TEYİT TARİHİ": record.manager_confirmed_at ? new Date(record.manager_confirmed_at).toLocaleString("tr-TR") : "",
    };
  });
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
