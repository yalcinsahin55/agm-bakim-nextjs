import { equipmentInfoCollection, usersCollection } from "@/lib/dbCollections";
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

function normalizeName(name: unknown): string {
  return String(name).trim().replace(/-/g, " ").replace(/\s+/g, " ");
}

type EquipmentInfoField = "kaver_tipi" | "hava_filtresi" | "krankcase" | "esanjor_tipi" | "dungs" | "radyator_tipi" | "not";

type EquipmentInfoImport = { engine_name: string } & Partial<Record<EquipmentInfoField, string | null>>;

const COLUMN_MAP: Record<string, EquipmentInfoField> = {
  "KAVER TİPİ": "kaver_tipi",
  "HAVA FİLTRESİ": "hava_filtresi",
  "KRANKCASE": "krankcase",
  "EŞANJÖR TİPİ": "esanjor_tipi",
  "DUNGS": "dungs",
  "RADYATÖR TİPİ": "radyator_tipi",
  "NOT": "not",
};

export async function POST(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
  }
  const rateLimited = await enforceApiRateLimit(req, "import-equipment-info", 12, 10 * 60 * 1000, user._id);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("boyutu") || message.includes("sayfası") ? 413 : 400;
    return NextResponse.json({ error: status === 413 ? "Excel çalışma sayfası izin verilen boyutu aşıyor." : "Dosya okunamadı." }, { status });
  }

  const worksheet = wb.worksheets[0];
  if (!worksheet) return NextResponse.json({ error: "Çalışma sayfası bulunamadı." }, { status: 400 });
  let grid: unknown[][];
  try {
    grid = worksheetToGrid(worksheet);
  } catch {
    return NextResponse.json({ error: "Excel çalışma sayfası izin verilen boyutu aşıyor." }, { status: 413 });
  }
  if (grid.length === 0) return NextResponse.json({ error: "Boş dosya." }, { status: 400 });

  const header = (grid[0] || []).map((h) => h ? String(h).trim().toUpperCase() : null);
  const motorCol = header.indexOf("MOTOR NO");
  if (motorCol === -1) return NextResponse.json({ error: "'Motor No' sütunu bulunamadı." }, { status: 400 });

  const colIndex: Partial<Record<EquipmentInfoField, number>> = {};
  (Object.entries(COLUMN_MAP) as Array<[string, EquipmentInfoField]>).forEach(([label, key]) => {
    const idx = header.indexOf(label);
    if (idx !== -1) colIndex[key] = idx;
  });

  const col = equipmentInfoCollection(db);
  let updated = 0;
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const nameRaw = row[motorCol];
    if (!nameRaw || !String(nameRaw).toUpperCase().includes("AGM")) continue;
    const name = normalizeName(nameRaw);
    const info: EquipmentInfoImport = { engine_name: name };
    (Object.entries(colIndex) as Array<[EquipmentInfoField, number]>).forEach(([key, idx]) => {
      const value = row[idx];
      info[key] = value === null || value === undefined ? null : String(value).trim() || null;
    });
    await col.updateOne({ _id: name }, { $set: info }, { upsert: true });
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
