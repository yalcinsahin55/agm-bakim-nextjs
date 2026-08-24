import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
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
  summary: ["by_engine", "by_type"],
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
};

const INTENT_ARRAY_LABELS: Record<string, string> = {
  by_engine: "Motor Dağılımı",
  by_type: "Bakım Türü Dağılımı",
  items: "Sonuçlar",
  records: "Bakım Geçmişi",
  activities: "Çalışılan Bakımlar",
  technicians: "Teknisyenler",
  services: "Dış Servisler",
  engines: "Motorlar",
  types: "Bakım Türleri",
  readings: "Karter Basıncı Ölçümleri",
  analyses: "Yağ Analizleri",
  infos: "Motor Bilgi Kartları",
  notifications: "Bildirimler",
};

function scalarRows(result: AssistantToolResponse): ExportRow[] {
  const selectedTechnician = result.data.selected_technician && typeof result.data.selected_technician === "object" ? result.data.selected_technician as Record<string, unknown> : null;
  const isSelectedTechnician = result.intent === "technician_performance" && Boolean(selectedTechnician);
  const globalTechnicianFields = new Set(["total_tasks", "total_responsible_tasks", "total_support_tasks", "total_duration_minutes", "total_duration_text", "top_technician"]);
  const rows = Object.entries(result.data)
    .filter(([key, value]) => !Array.isArray(value) && (typeof value !== "object" || value === null) && !(isSelectedTechnician && globalTechnicianFields.has(key)))
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

function arraySheets(result: AssistantToolResponse): Array<{ name: string; rows: ExportRow[] }> {
  const keys = result.intent === "technician_performance" && result.data.selected_technician
    ? ["activities", "by_type", "by_engine"]
    : INTENT_ARRAY_KEYS[result.intent] || [];
  return keys.flatMap((key) => {
    const value = result.data[key];
    if (!Array.isArray(value) || value.length === 0) return [];
    const values = value.slice(0, MAX_EXPORT_ROWS);
    const rows = values.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([field, fieldValue]) => [displayLabel(field), formatValue(fieldValue)]));
      }
      return { Değer: formatValue(item) };
    });
    return [{ name: INTENT_ARRAY_LABELS[key] || displayLabel(key), rows }];
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

function responseArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function reportTitle(result: AssistantToolResponse): string {
  return result.title || "Bakım Asistanı Raporu";
}

function applyForecastExclusions(result: AssistantToolResponse, rawExcludedTypes: string | null): AssistantToolResponse {
  if (result.intent !== "maintenance_forecast" || !rawExcludedTypes) return result;
  const excluded = rawExcludedTypes.split(",").map((value) => value.trim()).filter(Boolean);
  if (excluded.length === 0) return result;
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

async function createExcel(result: AssistantToolResponse, question: string): Promise<Response> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AGM Bakım Merkezi";
  workbook.created = new Date();
  const usedSheetNames = new Set<string>();
  const addDataSheet = (name: string, rows: ExportRow[]) => {
    const worksheet = workbook.addWorksheet(uniqueSheetName(name, usedSheetNames));
    addRows(worksheet, escapeSpreadsheetRows(rows));
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    if (rows.length > 0) worksheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + Math.min(26, Object.keys(rows[0]).length))}${rows.length + 1}` };
  };

  addDataSheet("Cevap Özeti", [
    { Alan: "Soru", Değer: question },
    { Alan: "Rapor", Değer: reportTitle(result) },
    { Alan: "Açıklama", Değer: result.summary },
    { Alan: "Üretim tarihi", Değer: new Date().toLocaleString("tr-TR") },
  ]);
  const scalar = scalarRows(result);
  if (scalar.length > 0) addDataSheet("Cevap Alanları", scalar);
  const sheets = arraySheets(result);
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

async function createPdf(result: AssistantToolResponse, question: string): Promise<Response> {
  const regularFont = path.join(process.cwd(), "public/fonts/agm-noto-sans.ttf");
  const boldFont = path.join(process.cwd(), "public/fonts/agm-noto-sans-bold.ttf");
  const hasFonts = fs.existsSync(regularFont) && fs.existsSync(boldFont);
  const doc = new PDFDocument({ size: "A4", margins: { top: 42, bottom: 42, left: 42, right: 42 }, autoFirstPage: true });
  const fontRegular = hasFonts ? regularFont : "Helvetica";
  const fontBold = hasFonts ? boldFont : "Helvetica-Bold";
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const heading = () => {
    doc.font(fontBold).fontSize(15).fillColor("#111827").text("Avcıkoru Santrali Motor Bakım Merkezi", doc.page.margins.left, 30, { width });
    doc.font(fontRegular).fontSize(10).fillColor("#4b5563").text(reportTitle(result), doc.page.margins.left, 52, { width });
    doc.font(fontRegular).fontSize(8).fillColor("#6b7280").text(`Rapor tarihi: ${new Date().toLocaleString("tr-TR")}`, doc.page.margins.left, 68, { width });
    doc.moveTo(doc.page.margins.left, 84).lineTo(doc.page.margins.left + width, 84).strokeColor("#9ca3af").lineWidth(0.7).stroke();
    doc.y = 98;
  };
  const ensureSpace = (height: number) => {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
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
  arraySheets(result).forEach((sheet) => {
    writeLine(sheet.name, true);
    sheet.rows.forEach((row, index) => {
      const content = Object.entries(row).map(([key, value]) => `${key}: ${formatValue(value)}`).join(" · ");
      writeLine(`${index + 1}. ${content}`);
    });
  });
  if (scalarRows(result).length === 0 && arraySheets(result).length === 0) writeLine("Sonuç ayrıntısı bulunamadı.");
  doc.font(fontRegular).fontSize(7.5).fillColor("#6b7280").text("Bu rapor salt okunur AGM Bakım verilerinden oluşturulmuştur.", doc.page.margins.left, doc.page.height - 28, { width, align: "left" });

  const buffer = await pdfBuffer(doc);
  return new NextResponse(responseArrayBuffer(buffer), {
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
  if (!hasPermission(user.role, "reports:read")) return jsonError("Bakım raporlarını görme yetkiniz yok.", 403);

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
  const result = applyForecastExclusions(await runAssistantTool(db, policy.query, { userId: user._id }), searchParams.get("exclude_type_label"));
  return format === "pdf" ? createPdf(result, question) : createExcel(result, question);
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/assistant/export", () => getAssistantExport(req), { request: req });
}
