import { enginesCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { MAX_IMPORT_BASE64_CHARS } from "@/lib/requestLimits";
import { loadExcelWorkbook, worksheetToObjects } from "@/lib/excel";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

function parseMetric(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5_000_000 ? parsed : null;
}

async function postImportHours(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
  }
  const rateLimited = await enforceApiRateLimit(req, "import-hours", 12, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const { file_b64, import_date } = await req.json();
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

  const sheet = wb.getWorksheet("Motor Saatleri") || wb.getWorksheet("Güncelleme Sayfası") || wb.worksheets[0];
  if (!sheet) return NextResponse.json({ error: "Çalışma sayfası bulunamadı." }, { status: 400 });
  let rows: Record<string, unknown>[];
  try {
    rows = worksheetToObjects(sheet);
  } catch {
    return NextResponse.json({ error: "Excel çalışma sayfası izin verilen boyutu aşıyor." }, { status: 413 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "Boş dosya." }, { status: 400 });

  const cols = Object.keys(rows[0]);
  const nameCol = cols.find((c) => c.toUpperCase().includes("MOTOR") && !c.toUpperCase().includes("SAAT") && !c.toUpperCase().includes("YÜK"));
  const hourCol = cols.find((c) => c.toUpperCase().includes("SAAT"));
  const loadCol = cols.find((c) => c.toUpperCase().includes("YÜK"));

  if (!nameCol || !hourCol) {
    return NextResponse.json({ error: "MOTOR ve MOTOR ÇALIŞMA SAATİ sütunları bulunamadı." }, { status: 400 });
  }

  const enginesCol = enginesCollection(db);
  const stamp = import_date ? new Date(import_date) : new Date();
  if (Number.isNaN(stamp.getTime())) return NextResponse.json({ error: "Geçersiz içe aktarma tarihi." }, { status: 400 });
  let updated = 0;

  for (const row of rows) {
    const name = String(row[nameCol] || "").trim();
    const hours = parseMetric(row[hourCol]);
    if (!name || hours === null) continue;

    const existing = await enginesCol.findOne({ _id: name });
    if (!existing) continue;

    const setFields: Record<string, any> = { updated_at: stamp };
    let hoursChanged = false;
    let loadChanged = false;
    if (hours !== existing.hours) { setFields.hours = hours; hoursChanged = true; }
    if (loadCol) {
      const newLoad = parseMetric(row[loadCol]);
      if (newLoad !== null && newLoad !== (existing.load_kw || 0)) { setFields.load_kw = newLoad; loadChanged = true; }
    }
    const updateOp: Record<string, any> = { $set: setFields };
    if (hoursChanged || loadChanged) {
      updateOp.$push = {
        history: {
          date: stamp.toISOString(),
          hours: hoursChanged ? hours : existing.hours,
          load_kw: loadChanged ? setFields.load_kw : (existing.load_kw || 0),
        },
      };
    }
    await enginesCol.updateOne({ _id: name }, updateOp);
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/import/hours", () => postImportHours(req), { request: req });
}
