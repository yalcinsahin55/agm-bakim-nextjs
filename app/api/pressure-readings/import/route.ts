import { enginesCollection, pressureReadingsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { MAX_IMPORT_BASE64_CHARS, MAX_IMPORT_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";
import { loadExcelWorkbook, worksheetToGrid } from "@/lib/excel";
import type { PressureReadingDocument } from "@/lib/dbTypes";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(name: unknown): string {
  return String(name).trim().replace(/-/g, " ").replace(/\s+/g, " ");
}

async function postImportPressureReadings(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
  }
  const rateLimited = await enforceApiRateLimit(req, "import-pressure-readings", 12, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const bodyResult = await parseJsonBodyLimited(req, MAX_IMPORT_REQUEST_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.tooLarge ? "Excel import isteği izin verilen boyutu aşıyor." : "Geçersiz Excel import verisi." },
      { status: bodyResult.tooLarge ? 413 : 400 },
    );
  }
  const { file_b64 } = bodyResult.value as { file_b64?: unknown };
  if (!file_b64) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
  if (typeof file_b64 !== "string" || file_b64.length > MAX_IMPORT_BASE64_CHARS) {
    return NextResponse.json({ error: "Excel dosyası izin verilen boyutu aşıyor." }, { status: 413 });
  }

  let wb: ExcelJS.Workbook;
  try {
    const buf = Buffer.from(file_b64, "base64");
    wb = await loadExcelWorkbook(buf);
  } catch {
    return NextResponse.json({ error: "Dosya okunamadı, geçerli bir Excel dosyası olduğundan emin olun." }, { status: 400 });
  }

  const engines = await enginesCollection(db).find({}, { projection: { _id: 1, name: 1 } }).toArray();
  const engineNames = new Set(engines.map((engine) => engine._id));
  const docs: Array<Omit<PressureReadingDocument, "_id">> = [];

  for (const worksheet of wb.worksheets) {
    const m = worksheet.name.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) continue;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const sheetDate = new Date(year, month - 1, day);
    if (sheetDate.getFullYear() !== year || sheetDate.getMonth() !== month - 1 || sheetDate.getDate() !== day) continue;
    const grid = worksheetToGrid(worksheet);

    let headerRow = -1;
    for (let r = 0; r < Math.min(5, grid.length); r++) {
      if (grid[r] && grid[r].some((v) => v === "MOTOR NO")) { headerRow = r; break; }
    }
    if (headerRow === -1) continue;

    const header = grid[headerRow] || [];
    const blocks: { motorCol: number; loadCol: number | null; pressureCol: number | null }[] = [];
    let current: { motorCol: number; loadCol: number | null; pressureCol: number | null } | null = null;
    header.forEach((label, c) => {
      if (label === "MOTOR NO") {
        if (current) blocks.push(current);
        current = { motorCol: c, loadCol: null, pressureCol: null };
      } else if (current) {
        if (label === "YÜK") current.loadCol = c;
        if (label === "KARTER FARK BASINCI") current.pressureCol = c;
      }
    });
    if (current) blocks.push(current);

    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      for (const b of blocks) {
        const engineRaw = row[b.motorCol];
        if (!engineRaw || !String(engineRaw).toUpperCase().includes("AGM")) continue;
        const engine = normalizeName(engineRaw);
        if (!engineNames.has(engine)) continue;

        const loadVal = b.loadCol !== null ? row[b.loadCol] : null;
        const pressureVal = b.pressureCol !== null ? row[b.pressureCol] : null;
        const loadKw = toNumber(loadVal);
        const pressureBar = toNumber(pressureVal);
        let status: string | null = null;
        [loadVal, pressureVal].forEach((v) => {
          if (v !== null && v !== undefined && String(v).trim() !== "" && toNumber(v) === null) status = String(v).trim().toUpperCase();
        });
        if (loadKw === null && pressureBar === null && !status) continue;

        docs.push({
          engine_id: engine, engine_name: engine, reading_date: sheetDate,
          load_kw: loadKw, pressure_bar: pressureBar, status,
          new_type: false, note: null, uploaded_by: user.full_name, uploaded_by_id: user._id,
          created_at: new Date(),
        });
      }
    }
  }

  if (docs.length > 0) {
    await pressureReadingsCollection(db).insertMany(docs);
  }

  return NextResponse.json({ ok: true, inserted: docs.length });
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/pressure-readings/import", () => postImportPressureReadings(req), { request: req });
}
