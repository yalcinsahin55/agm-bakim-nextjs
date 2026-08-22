import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
  }

  const { file_b64, import_date } = await req.json();
  if (!file_b64) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });

  let wb: XLSX.WorkBook;
  try {
    const buf = Buffer.from(file_b64, "base64");
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "Dosya okunamadı." }, { status: 400 });
  }

  const sheetName = ["Motor Saatleri", "Güncelleme Sayfası"].find((n) => wb.SheetNames.includes(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[];
  if (rows.length === 0) return NextResponse.json({ error: "Boş dosya." }, { status: 400 });

  const cols = Object.keys(rows[0]);
  const nameCol = cols.find((c) => c.toUpperCase().includes("MOTOR") && !c.toUpperCase().includes("SAAT") && !c.toUpperCase().includes("YÜK"));
  const hourCol = cols.find((c) => c.toUpperCase().includes("SAAT"));
  const loadCol = cols.find((c) => c.toUpperCase().includes("YÜK"));

  if (!nameCol || !hourCol) {
    return NextResponse.json({ error: "MOTOR ve MOTOR ÇALIŞMA SAATİ sütunları bulunamadı." }, { status: 400 });
  }

  const enginesCol = db.collection("engines") as any;
  // Excel'deki verinin ait olduğu tarih seçilebilir — seçilmezse şu an kullanılır.
  const stamp = import_date ? new Date(import_date) : new Date();
  let updated = 0;

  for (const row of rows) {
    const name = String(row[nameCol] || "").trim();
    const hours = Number(row[hourCol]);
    if (!name || Number.isNaN(hours)) continue;

    const existing = await enginesCol.findOne({ _id: name });
    if (!existing) continue;

    const setFields: Record<string, any> = { updated_at: stamp };
    let hoursChanged = false;
    let loadChanged = false;
    if (hours !== existing.hours) { setFields.hours = hours; hoursChanged = true; }
    if (loadCol && row[loadCol] !== null && !Number.isNaN(Number(row[loadCol]))) {
      const newLoad = Number(row[loadCol]);
      if (newLoad !== (existing.load_kw || 0)) { setFields.load_kw = newLoad; loadChanged = true; }
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
