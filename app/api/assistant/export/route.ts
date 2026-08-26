import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getPdfFontPaths } from "@/lib/pdfFonts";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getClientIp } from "@/lib/rate-limit";
import { checkDistributedRateLimit } from "@/lib/redisRateLimit";
import { evaluateAssistantQuestion, ASSISTANT_RATE_LIMIT, ASSISTANT_RATE_WINDOW_MS } from "@/lib/assistantPolicy";
import { runAssistantTool, type AssistantToolResponse } from "@/lib/assistantTools";
import { usersCollection } from "@/lib/dbCollections";
import { escapeSpreadsheetRows } from "@/lib/spreadsheetSecurity";
import { addRows } from "@/lib/excel";
import { withApiTiming } from "@/lib/performance";
import { exportColumnLabel, exportSheetLabel, getExportColumnValue, getAvailableColumns, normalizeExportOptions, type AssistantExportOptions, type ExportColumnId } from "@/lib/assistantExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_QUESTION_LENGTH = 300;
const MAX_EXPORT_ROWS = 500;
const MAX_PDF_LINE_LENGTH = 1_200;

type ExportFormat = "pdf" | "excel";

type ExportRow = Record<string, unknown>;

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "rapor";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleString("tr-TR");
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("tr-TR") : "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${formatValue(item)}`)
      .join(" · ");
  }
  return String(value);
}

function displayLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const INTENT_ARRAY_KEYS: Record<string, string[]> = {
  summary: ["by_engine", "by_type", "daily_records"],
  overdue: ["items"],
  engine_history: ["records"],
  technician_performance: ["activities", "by_type", "by_engine", "technicians"],
  external_service: ["services", "engines"],
  maintenance_forecast: ["items"],
  engine_data: ["engines"],
  maintenance_catalog: ["types"],
  pressure_readings: ["readings"],
  oil_analysis: ["analyses"],
  equipment_info: ["infos"],
  technician_directory: ["technicians"],
  notification_summary: ["notifications"],
  maintenance_health: ["items"],
  performance_daily: ["performance_daily"],
};

function isEmptyExportValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function scalarRows(result: AssistantToolResponse): ExportRow[] {
  const selectedTechnician = result.data.selected_technician && typeof result.data.selected_technician === "object" ? result.data.selected_technician as Record<string, unknown> : null;
  const isSelectedTechnician = result.intent === "technician_performance" && Boolean(selectedTechnician);
  const globalTechnicianFields = new Set(["total_tasks", "total_responsible_tasks", "total_support_tasks", "total_duration_minutes", "total_duration_text", "top_technician"]);
  const rows = Object.entries(result.data)
    .filter(([key, value]) => !isEmptyExportValue(value) && !Array.isArray(value) && (typeof value !== "object" || value === null) && !(isSelectedTechnician && globalTechnicianFields.has(key)))
    .map(([key, value]) => ({ Alan: displayLabel(key), Değer: formatValue(value) }));
  if (selectedTechnician) {
    for (const key of ["full_name", "technician_type", "responsible_tasks", "support_tasks", "total_tasks", "duration_minutes", "duration_text"]) {
      if (selectedTechnician[key] !== undefined) rows.push({ Alan: displayLabel(key), Değer: formatValue(selectedTechnician[key]) });
    }
  }
  const topTechnician = result.data.top_technician && typeof result.data.top_technician === "object" ? result.data.top_technician as Record<string, unknown> : null;
  if (topTechnician && !selectedTechnician) {
    rows.push({ Alan: "En Çok Görev Alan Teknisyen", Değer: formatValue(topTechnician.full_name) });
    rows.push({ Alan: "En Çok Görev Alan Teknisyen Görevi", Değer: formatValue(topTechnician.total_tasks) });
  }
  return rows;
}

function comparableExportValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/ı/g, "i").toLocaleLowerCase("tr-TR").trim();
}

function sortExportItems(items: unknown[], sort: AssistantExportOptions["sort"]): unknown[] {
  const key = sort === "engine" ? "engine" : sort === "type" ? "type" : sort === "technician" ? "technician" : "date";
  return [...items].sort((left, right) => {
    const a = left && typeof left === "object" ? getExportColumnValue(left as Record<string, unknown>, key === "date" ? "date" : key) : "";
    const b = right && typeof right === "object" ? getExportColumnValue(right as Record<string, unknown>, key === "date" ? "date" : key) : "";
    const aValue = key === "date" ? new Date(String(a || "")).getTime() || 0 : comparableExportValue(a);
    const bValue = key === "date" ? new Date(String(b || "")).getTime() || 0 : comparableExportValue(b);
    if (aValue < bValue) return sort === "date_desc" ? 1 : -1;
    if (aValue > bValue) return sort === "date_desc" ? -1 : 1;
    return 0;
  });
}

function distributionDetails(value: unknown, labelKey: "type" | "engine"): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const details = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = record[labelKey];
    if (typeof label !== "string" || !label.trim()) return [];
    const count = typeof record.count === "number" && Number.isFinite(record.count) ? ` (${record.count.toLocaleString("tr-TR")})` : "";
    return [`${label.trim()}${count}`];
  });
  return details.length ? details.join(", ") : null;
}

function sheetColumnValue(record: Record<string, unknown>, column: ExportColumnId, sheetKey: string): unknown {
  if (sheetKey === "by_engine" && column === "type") return distributionDetails(record.type_stats, "type");
  if (sheetKey === "by_type" && column === "engine") return distributionDetails(record.engines, "engine");
  return getExportColumnValue(record, column);
}

function arraySheets(result: AssistantToolResponse, options: AssistantExportOptions): Array<{ name: string; rows: ExportRow[] }> {
  const keys = options.sheets.length ? options.sheets : INTENT_ARRAY_KEYS[result.intent] || [];
  const columns = options.columns.length ? options.columns : getAvailableColumns(result.intent);
  return keys.flatMap((key) => {
    const value = result.data[key];
    if (!Array.isArray(value) || value.length === 0) return [];
    const values = sortExportItems(value.slice(0, MAX_EXPORT_ROWS), options.sort);
    const records = values.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
    const effectiveColumns = columns.filter((column) => records.some((record) => !isEmptyExportValue(sheetColumnValue(record, column, key))));
    const rows = values.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        return Object.fromEntries(effectiveColumns.map((column) => [exportColumnLabel(column), formatValue(sheetColumnValue(record, column, key))]));
      }
      return { Değer: formatValue(item) };
    });
    return [{ name: exportSheetLabel(key), rows }];
  });
}

function uniqueSheetName(label: string, used: Set<string>): string {
  const base = label.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31) || "Sonuçlar";
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

function pdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function reportTitle(result: AssistantToolResponse): string {
  return result.title || "Bakım Asistanı Raporu";
}

function loadDefaultExportLogo(): { buffer: Buffer; extension: "jpeg" } | null {
  const logoPath = path.join(process.cwd(), "public", "yesil-global-logo.jpg");
  return existsSync(logoPath) ? { buffer: readFileSync(logoPath), extension: "jpeg" } : null;
}

async function fetchExportLogo(url: string | null): Promise<{ buffer: Buffer; extension: "png" | "jpeg" } | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !/(^|\.)public\.blob\.vercel-storage\.com$/i.test(parsed.hostname)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(parsed, { cache: "no-store", signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (!response.ok || !/^image\/(?:png|jpeg)$/i.test(contentType) || contentLength > 1_500_000) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > 1_500_000) return null;
    return { buffer, extension: contentType.toLowerCase().includes("jpeg") ? "jpeg" : "png" };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function applyForecastExclusions(result: AssistantToolResponse, excluded: string[]): AssistantToolResponse {
  if (result.intent !== "maintenance_forecast" || excluded.length === 0) return result;
  const data = { ...result.data };
  const items = Array.isArray(data.items) ? data.items : [];
  const visibleItems = items.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const type = String((item as Record<string, unknown>).type || "");
    return !excluded.some((value) => value.localeCompare(type, "tr", { sensitivity: "base" }) === 0);
  });
  const isOverdue = (item: unknown) => item && typeof item === "object" && String((item as Record<string, unknown>).category) === "overdue";
  data.items = visibleItems;
  data.total = visibleItems.length;
  data.overdue_count = visibleItems.filter(isOverdue).length;
  data.scheduled_count = visibleItems.length - Number(data.overdue_count || 0);
  const targetYear = Number(data.target_year || 0);
  data.target_year_count = targetYear > 0 ? visibleItems.filter((item) => item && typeof item === "object" && Number((item as Record<string, unknown>).forecast_year) === targetYear).length : 0;
  data.before_target_year_count = targetYear > 0 ? visibleItems.filter((item) => item && typeof item === "object" && String((item as Record<string, unknown>).category) === "before_target_year").length : 0;
  return { ...result, summary: `${result.summary} Hariç tutulan bakım türleri: ${excluded.join(", ")}.`, data };
}

function typeIsExcluded(value: unknown, excluded: string[]): boolean {
  return typeof value === "string" && excluded.some((item) => item.localeCompare(value, "tr", { sensitivity: "base" }) === 0);
}

function applyExportTypeExclusions(result: AssistantToolResponse, excluded: string[]): AssistantToolResponse {
  if (excluded.length === 0) return result;
  if (result.intent === "maintenance_forecast") return applyForecastExclusions(result, excluded);
  const data = { ...result.data };
  if (Array.isArray(data.items)) {
    data.items = data.items.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      return !typeIsExcluded(record.type, excluded) && !typeIsExcluded(record.type_label, excluded);
    });
  }
  if (Array.isArray(data.types)) {
    data.types = data.types.filter((item) => item && typeof item === "object" && !typeIsExcluded((item as Record<string, unknown>).type, excluded));
  }
  if (Array.isArray(data.daily_records)) {
    data.daily_records = data.daily_records.map((item) => {
      if (!item || typeof item !== "object") return item;
      const record = item as Record<string, unknown>;
      const types = Array.isArray(record.types) ? record.types.filter((type) => !typeIsExcluded(type, excluded)) : record.types;
      return { ...record, ...(Array.isArray(types) ? { types, count: types.length } : {}) };
    }).filter((item) => !item || typeof item !== "object" || !Array.isArray((item as Record<string, unknown>).types) || ((item as Record<string, unknown>).types as unknown[]).length > 0);
  }
  if (result.intent === "overdue") {
    data.count = Array.isArray(data.items) ? data.items.length : 0;
    data.displayed_count = data.count;
  }
  if (result.intent === "maintenance_health") {
    const counts = Array.isArray(data.items) ? data.items.reduce<Record<string, number>>((accumulator, item) => {
      const status = item && typeof item === "object" ? String((item as Record<string, unknown>).status || "normal") : "normal";
      accumulator[status] = (accumulator[status] || 0) + 1;
      return accumulator;
    }, {}) : {};
    data.counts = counts;
  }
  return { ...result, summary: `${result.summary} Hariç tutulan bakım türleri: ${excluded.join(", ")}.`, data };
}

async function createExcel(result: AssistantToolResponse, question: string, options: AssistantExportOptions): Promise<Response> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AGM Bakım Merkezi";
  workbook.created = new Date();
  const customLogo = options.includeLogo ? await fetchExportLogo(options.logoUrl) : null;
  const logo = customLogo || (options.includeLogo ? loadDefaultExportLogo() : null);
  let logoId: number | null = null;
  if (logo) {
    try {
      logoId = workbook.addImage({ base64: logo.buffer.toString("base64"), extension: logo.extension });
    } catch {
      logoId = null;
    }
  }
  const usedSheetNames = new Set<string>();
  const addDataSheet = (name: string, rows: ExportRow[]) => {
    const worksheet = workbook.addWorksheet(uniqueSheetName(name, usedSheetNames));
    addRows(worksheet, escapeSpreadsheetRows(rows));
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    if (rows.length > 0) worksheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + Math.min(26, Object.keys(rows[0]).length))}${rows.length + 1}` };
    return worksheet;
  };

  const summarySheet = addDataSheet("Cevap Özeti", [
    { Alan: "Soru", Değer: question },
    { Alan: "Rapor", Değer: reportTitle(result) },
    { Alan: "Açıklama", Değer: result.summary },
    { Alan: "Şablon", Değer: options.preset },
    { Alan: "Sıralama", Değer: options.sort },
    { Alan: "Marka", Değer: options.includeLogo ? "AGM Bakım Merkezi" : "Dahil edilmedi" },
    { Alan: "Üretim tarihi", Değer: new Date().toLocaleString("tr-TR") },
  ]);
  if (logoId !== null) summarySheet.addImage(logoId, { tl: { col: 3, row: 0 }, ext: { width: 140, height: 60 } });
  const scalar = scalarRows(result);
  if (scalar.length > 0) addDataSheet("Cevap Alanları", scalar);
  const sheets = arraySheets(result, options);
  sheets.forEach((sheet) => addDataSheet(sheet.name, sheet.rows));
  if (sheets.length === 0 && scalar.length === 0) addDataSheet("Sonuçlar", [{ Değer: result.summary }]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String((buffer as ArrayBuffer).byteLength),
      "Content-Disposition": `attachment; filename="AGM_Bakim_Asistani_${safeFilenamePart(result.intent)}.xlsx"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function createPdf(result: AssistantToolResponse, question: string, options: AssistantExportOptions): Promise<Response> {
  const { regular: fontRegular, bold: fontBold } = getPdfFontPaths();
  const customLogo = options.includeLogo ? await fetchExportLogo(options.logoUrl) : null;
  const logo = customLogo || (options.includeLogo ? loadDefaultExportLogo() : null);
  const margin = options.margin === "narrow" ? 28 : 42;
  const doc = new PDFDocument({ size: options.pageSize, layout: options.orientation, margins: { top: margin, bottom: margin, left: margin, right: margin }, font: fontRegular, autoFirstPage: true });
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const heading = () => {
    const titleOffset = options.includeLogo ? 34 : 0;
    if (options.includeLogo) {
      let renderedCustomLogo = false;
      if (logo) {
        try {
          doc.image(logo.buffer, doc.page.margins.left, 34, { fit: [24, 24], align: "center", valign: "center" });
          renderedCustomLogo = true;
        } catch {
          renderedCustomLogo = false;
        }
      }
      if (!renderedCustomLogo) {
        doc.save().circle(doc.page.margins.left + 12, 46, 12).fillColor("#e8952f").fill();
        doc.font(fontBold).fontSize(6.5).fillColor("#111827").text("AGM", doc.page.margins.left + 2, 42, { width: 20, align: "center" });
        doc.restore();
      }
    }
    doc.font(fontBold).fontSize(15).fillColor("#111827").text("Avcıkoru Santrali Motor Bakım Merkezi", doc.page.margins.left + titleOffset, 30, { width: width - titleOffset });
    doc.font(fontRegular).fontSize(10).fillColor("#4b5563").text(reportTitle(result), doc.page.margins.left + titleOffset, 52, { width: width - titleOffset });
    doc.font(fontRegular).fontSize(8).fillColor("#6b7280").text(`Rapor tarihi: ${new Date().toLocaleString("tr-TR")}`, doc.page.margins.left + titleOffset, 68, { width: width - titleOffset });
    doc.moveTo(doc.page.margins.left, 84).lineTo(doc.page.margins.left + width, 84).strokeColor("#9ca3af").lineWidth(0.7).stroke();
    doc.y = 98;
  };
  const writeFooter = () => {
    if (!options.includeFooter) return;
    doc.font(fontRegular).fontSize(7.5).fillColor("#6b7280").text("Salt okunur AGM Bakım raporu · Soru kapsamıyla sınırlıdır.", doc.page.margins.left, doc.page.height - doc.page.margins.bottom + 10, { width });
  };
  const ensureSpace = (height: number) => {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom - 18) {
      writeFooter();
      doc.addPage();
      heading();
    }
  };
  const writeLine = (text: string, bold = false) => {
    const safeText = text.slice(0, MAX_PDF_LINE_LENGTH);
    const lineHeight = doc.heightOfString(safeText, { width, lineGap: 1 }) + 5;
    ensureSpace(lineHeight);
    doc.font(bold ? fontBold : fontRegular).fontSize(bold ? 10.5 : 9).fillColor(bold ? "#111827" : "#374151").text(safeText, { width, lineGap: 1 });
    doc.y += 2;
  };

  heading();
  writeLine("Soru", true);
  writeLine(question);
  writeLine("Cevap", true);
  writeLine(result.summary);

  scalarRows(result).forEach((row) => writeLine(`${row.Alan}: ${row.Değer}`));
  arraySheets(result, options).forEach((sheet) => {
    writeLine(sheet.name, true);
    sheet.rows.forEach((row, index) => {
      const content = Object.entries(row).map(([key, value]) => `${key}: ${formatValue(value)}`).join(" · ");
      writeLine(`${index + 1}. ${content}`);
    });
  });
  if (scalarRows(result).length === 0 && arraySheets(result, options).length === 0) writeLine("Sonuç ayrıntısı bulunamadı.");
  writeFooter();

  const buffer = await pdfBuffer(doc);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": `attachment; filename="AGM_Bakim_Asistani_${safeFilenamePart(result.intent)}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function getAssistantExport(req: NextRequest): Promise<Response> {
  const db = await getDb();
  const user = await getCurrentUser(req, usersCollection(db));
  if (!user) return jsonError("Giriş gerekli", 401);
  if (!hasPermission(user.role, "assistant:read")) return jsonError("Bakım asistanı raporlarını indirme yetkiniz yok.", 403);

  const rate = await checkDistributedRateLimit({
    scope: "assistant-export",
    identifier: `${user._id}:${getClientIp(req)}`,
    limit: ASSISTANT_RATE_LIMIT,
    windowMs: ASSISTANT_RATE_WINDOW_MS,
  }, "fail-closed");
  if (rate.infrastructureFailure) return jsonError("İstek koruma servisi geçici olarak kullanılamıyor. Lütfen biraz sonra tekrar deneyin.", 503);
  if (!rate.ok) return jsonError("Çok fazla rapor istendi. Lütfen biraz sonra tekrar deneyin.", 429);

  const searchParams = new URL(req.url).searchParams;
  const question = searchParams.get("question")?.trim() || "";
  const format = searchParams.get("format") as ExportFormat | null;
  if (!question || question.length > MAX_QUESTION_LENGTH) return jsonError("Geçerli bir soru gerekli.", 400);
  if (format !== "pdf" && format !== "excel") return jsonError("Desteklenmeyen rapor formatı.", 400);

  const policy = evaluateAssistantQuestion(question);
  if (!policy.ok || !policy.query) return jsonError(policy.message || "Bu soru rapora dönüştürülemedi.", 400);
  const requestedExcludedTypes = String(searchParams.get("exclude_type_label") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 30);
  const query = requestedExcludedTypes.length ? { ...policy.query, excludedTypeLabels: requestedExcludedTypes } : policy.query;
  const resultFromQuery = await runAssistantTool(db, query, { userId: user._id });
  const options = normalizeExportOptions(policy.query.intent, resultFromQuery.data, {
    preset: searchParams.get("preset"),
    columns: searchParams.get("columns"),
    sheets: searchParams.get("sheets"),
    orientation: searchParams.get("orientation"),
    page_size: searchParams.get("page_size"),
    margin: searchParams.get("margin"),
    sort: searchParams.get("sort"),
    include_logo: searchParams.get("include_logo"),
    include_footer: searchParams.get("include_footer"),
    logo_url: searchParams.get("logo_url"),
    exclude_type_label: searchParams.get("exclude_type_label"),
  });
  const result = options.excludedTypes.length
    ? applyExportTypeExclusions(resultFromQuery, options.excludedTypes)
    : resultFromQuery;
  return format === "pdf" ? createPdf(result, question, options) : createExcel(result, question, options);
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/assistant/export", () => getAssistantExport(req), { request: req   }).catch((error) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message.replace(/[\\r\\n]+/g, " ").slice(0, 240) : "";
    console.error("GET /api/assistant/export hatası:", JSON.stringify({ name: errorName, message: errorMessage }));
    return jsonError("PDF/Excel raporu hazırlanırken bir hata oluştu.", 500);
  });
}
