import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { engineSortKey } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();

    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const engines = await (db.collection("engines") as any).find().toArray();
    engines.sort((a: any, b: any) => engineSortKey(a.name) - engineSortKey(b.name));
    return NextResponse.json(engines);
  } catch (error) {
    console.error("Motorlar getirilirken hata:", error);
    return NextResponse.json({ error: "Motorlar yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!["yonetici", "planlamaci"].includes(user.role)) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const { name, hours, load_kw } = await req.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Motor adı gerekli." }, { status: 400 });
    }

    const enginesCol = db.collection("engines") as any;
    const existing = await enginesCol.findOne({ _id: name.trim() });
    if (existing) {
      return NextResponse.json({ error: "Bu isimde bir motor zaten var." }, { status: 409 });
    }

    const now = new Date();
    const doc = {
      _id: name.trim(),
      name: name.trim(),
      hours: Number(hours) || 0,
      load_kw: Number(load_kw) || 0,
      updated_at: now,
      history: [{ date: now.toISOString(), hours: Number(hours) || 0 }],
    };
    await enginesCol.insertOne(doc);
    return NextResponse.json(doc);
  } catch (error) {
    console.error("Motor eklenirken hata:", error);
    return NextResponse.json({ error: "Motor eklenirken bir hata oluştu." }, { status: 500 });
  }
}
