import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { escapeSpreadsheetRows } from "@/lib/spreadsheetSecurity";
import { addRows } from "@/lib/excel";
import { loadDefaultExportLogo } from "@/lib/exportBranding";
import { fetchExportLogo } from "@/lib/assistantExportLogo";
import { arraySheets, reportTitle, safeFilenamePart, scalarRows, uniqueSheetName, type ExportRow } from "@/lib/assistantExportRows";
import type { AssistantToolResponse } from "@/lib/assistantTools";
import type { AssistantExportOptions } from "@/lib/assistantExport";

export async function createExcel(result: AssistantToolResponse, question: string, options: AssistantExportOptions): Promise<Response> {
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
    { Alan: "Marka", Değer: options.includeLogo ? "Yeşil Global Enerji · AGM Bakım Merkezi" : "Dahil edilmedi" },
    { Alan: "Üretim tarihi", Değer: new Date().toLocaleString("tr-TR") },
  ]);
  if (logoId !== null) summarySheet.addImage(logoId, { tl: { col: 3, row: 0 }, ext: { width: 180, height: 27 } });
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

