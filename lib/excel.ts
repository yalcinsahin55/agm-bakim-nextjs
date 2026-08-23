import ExcelJS from "exceljs";
import JSZip from "jszip";

export const MAX_EXCEL_ROWS = 50_000;
export const MAX_EXCEL_COLUMNS = 100;
export const MAX_EXCEL_SHEETS = 100;

async function removeLegacyCommentMetadata(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const relationshipPattern = /<Relationship\b[^>]*\bType="[^"]*\/(?:comments|vmlDrawing)"[^>]*\/>/g;
  const legacyDrawingPattern = /<legacyDrawing\b[^>]*\/>/g;

  for (const path of Object.keys(zip.files)) {
    if (/^xl\/(comments\/|drawings\/commentsDrawing)/.test(path)) {
      zip.remove(path);
      continue;
    }
    if (/^xl\/worksheets\/_rels\/sheet[^/]+\.xml\.rels$/.test(path)) {
      const xml = await zip.file(path)?.async("string");
      if (xml) zip.file(path, xml.replace(relationshipPattern, ""));
      continue;
    }
    if (/^xl\/worksheets\/sheet[^/]+\.xml$/.test(path)) {
      const xml = await zip.file(path)?.async("string");
      if (xml) zip.file(path, xml.replace(legacyDrawingPattern, ""));
    }
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

export async function loadExcelWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const normalizedBuffer = await removeLegacyCommentMetadata(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(normalizedBuffer as any);
  if (workbook.worksheets.length > MAX_EXCEL_SHEETS) {
    throw new Error("Çok fazla çalışma sayfası.");
  }
  return workbook;
}

export function cellToValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const cell = value as Record<string, unknown>;
  if ("result" in cell) return cell.result;
  if ("text" in cell && typeof cell.text === "string") return cell.text;
  if ("hyperlink" in cell && typeof cell.hyperlink === "string") return cell.hyperlink;
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((part: any) => String(part?.text || "")).join("");
  }
  return value;
}

export function worksheetToGrid(worksheet: ExcelJS.Worksheet): unknown[][] {
  if (worksheet.rowCount > MAX_EXCEL_ROWS || worksheet.columnCount > MAX_EXCEL_COLUMNS) {
    throw new Error("Excel çalışma sayfası izin verilen boyutu aşıyor.");
  }
  const width = Math.min(worksheet.columnCount, MAX_EXCEL_COLUMNS);
  const grid: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values: unknown[] = [];
    for (let column = 1; column <= width; column += 1) {
      values.push(cellToValue(row.getCell(column).value));
    }
    grid.push(values);
  });
  return grid;
}

export function worksheetToObjects(worksheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const grid = worksheetToGrid(worksheet);
  const header = (grid[0] || []).map((value) => value == null ? "" : String(value));
  return grid.slice(1).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? null])));
}

export function addRows(worksheet: ExcelJS.Worksheet, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  worksheet.addRow(headers);
  rows.forEach((row) => worksheet.addRow(headers.map((header) => row[header] ?? null)));
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(Math.max(header.length + 4, 12), 34) }));
}
