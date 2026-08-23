import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { MAX_IMPORT_BASE64_CHARS } from "@/lib/requestLimits";
import { loadExcelWorkbook, worksheetToGrid } from "@/lib/excel";

export const dynamic = "force-dynamic";

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(name: unknown): string {
  return String(name).trim().replace(/-/g, " ").replace(/\s+/g, " ");
}

export async function POST(req: NextRequest) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
  }
  const rateLimited = enforceApiRateLimit(req, "import-pressure-readings", 12, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const { file_b64 } = await req.json();
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

  const engines = await (db.collection("engines") as any).find().toArray();
  const engineNames = new Set(engines.map((e: any) => e._id));
  const docs: any[] = [];

  for (const worksheet of wb.worksheets) {
    const m = worksheet.name.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) continue;
    const sheetDate = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
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
        let status: string | null = null;
        [loadVal, pressureVal].forEach((v) => {
          if (v !== null && v !== undefined && toNumber(v) === null) status = String(v).trim().toUpperCase();
        });

        docs.push({
          engine_id: engine, engine_name: engine, reading_date: sheetDate,
          load_kw: toNumber(loadVal), pressure_bar: toNumber(pressureVal), status,
          new_type: false, note: null, uploaded_by: user.full_name, uploaded_by_id: user._id,
          created_at: new Date(),
        });
      }
    }
  }

  if (docs.length > 0) {
    await (db.collection("pressure_readings") as any).insertMany(docs);
  }

  return NextResponse.json({ ok: true, inserted: docs.length });
}
