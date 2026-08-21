import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function toNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(name: any): string {
  return String(name).trim().replace(/-/g, " ").replace(/\s+/g, " ");
}

export async function POST(req: NextRequest) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!["yonetici", "planlamaci"].includes(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici veya planlamacı yetkisi gerekir." }, { status: 403 });
  }

  const { file_b64 } = await req.json();
  if (!file_b64) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });

  let wb: XLSX.WorkBook;
  try {
    const buf = Buffer.from(file_b64, "base64");
    wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return NextResponse.json({ error: "Dosya okunamadı, geçerli bir Excel dosyası olduğundan emin olun." }, { status: 400 });
  }

  const engines = await (db.collection("engines") as any).find().toArray();
  const engineNames = new Set(engines.map((e: any) => e._id));

  const docs: any[] = [];

  for (const sheetName of wb.SheetNames) {
    const m = sheetName.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) continue;
    const sheetDate = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];

    let headerRow = -1;
    for (let r = 0; r < Math.min(5, grid.length); r++) {
      if (grid[r] && grid[r].some((v) => v === "MOTOR NO")) { headerRow = r; break; }
    }
    if (headerRow === -1) continue;

    const header = grid[headerRow];
    const blocks: { motorCol: number; loadCol: number | null; pressureCol: number | null }[] = [];
    let current: { motorCol: number; loadCol: number | null; pressureCol: number | null } | null = null;
    header.forEach((label: any, c: number) => {
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
