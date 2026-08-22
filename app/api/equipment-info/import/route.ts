import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function normalizeName(name: any): string {
  return String(name).trim().replace(/-/g, " ").replace(/\s+/g, " ");
}

const COLUMN_MAP: Record<string, string> = {
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
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
  }

  const { file_b64 } = await req.json();
  if (!file_b64) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });

  let wb: XLSX.WorkBook;
  try {
    const buf = Buffer.from(file_b64, "base64");
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "Dosya okunamadı." }, { status: 400 });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
  if (grid.length === 0) return NextResponse.json({ error: "Boş dosya." }, { status: 400 });

  const header = (grid[0] || []).map((h: any) => (h ? String(h).trim().toUpperCase() : null));
  const motorCol = header.indexOf("MOTOR NO");
  if (motorCol === -1) return NextResponse.json({ error: "'Motor No' sütunu bulunamadı." }, { status: 400 });

  const colIndex: Record<string, number> = {};
  Object.entries(COLUMN_MAP).forEach(([label, key]) => {
    const idx = header.indexOf(label);
    if (idx !== -1) colIndex[key] = idx;
  });

  const col = db.collection("equipment_info") as any;
  let updated = 0;
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const nameRaw = row[motorCol];
    if (!nameRaw || !String(nameRaw).toUpperCase().includes("AGM")) continue;
    const name = normalizeName(nameRaw);
    const info: Record<string, any> = { engine_name: name };
    Object.entries(colIndex).forEach(([key, idx]) => { info[key] = row[idx] ?? null; });
    await col.updateOne({ _id: name }, { $set: info }, { upsert: true });
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
