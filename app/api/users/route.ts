import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (user.role !== "yonetici") return NextResponse.json({ error: "Bu sayfa yalnızca yöneticiler içindir." }, { status: 403 });

    const users = await usersCol.find().toArray();
    return NextResponse.json(users.map((u: any) => ({
      id: u._id, full_name: u.full_name, email: u.email, role: u.role, active: u.active !== false, created_at: u.created_at,
    })));
  } catch (error) {
    console.error("Kullanıcılar getirilirken hata:", error);
    return NextResponse.json({ error: "Kullanıcı listesi yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (user.role !== "yonetici") return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });

    const { full_name, email, password, role } = await req.json();

    // E-posta ve şifre kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!full_name || !email || !emailRegex.test(email)) {
      return NextResponse.json({ error: "Lütfen geçerli bir isim ve e-posta adresi girin." }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalıdır." }, { status: 400 });
    }

    const id = email.toLowerCase().trim();
    const existing = await usersCol.findOne({ _id: id });
    if (existing) return NextResponse.json({ error: "Bu e-posta zaten kayıtlı." }, { status: 409 });

    const passwordHash = await hashPassword(password);
    await usersCol.insertOne({
      _id: id, full_name: full_name.trim(), email: id, password_hash: passwordHash,
      role: role || "teknisyen", active: true, created_at: new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Kullanıcı eklenirken hata:", error);
    return NextResponse.json({ error: "Kullanıcı eklenirken bir hata oluştu." }, { status: 500 });
  }
}
