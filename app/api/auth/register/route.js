import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { full_name, email, password } = await req.json();

    // E-posta ve şifre kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!full_name || !email || !emailRegex.test(email)) {
      return NextResponse.json({ error: "Lütfen geçerli bir isim ve e-posta adresi girin." }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalıdır." }, { status: 400 });
    }

    const db = await getDb();
    const usersCol = db.collection("users");
    const id = email.toLowerCase().trim();

    const existing = await usersCol.findOne({ _id: id });
    if (existing) {
      return NextResponse.json({ error: "Bu e-posta adresi zaten kullanılıyor." }, { status: 409 });
    }

    // İlk kayıt olan kullanıcı otomatik olarak yönetici olur
    const userCount = await usersCol.countDocuments();
    const role = userCount === 0 ? "yonetici" : "teknisyen";

    const passwordHash = await hashPassword(password);
    await usersCol.insertOne({
      _id: id, full_name: full_name.trim(), email: id, password_hash: passwordHash,
      role, active: true, created_at: new Date(),
    });

    const token = await createSessionToken(id);
    const res = NextResponse.json({
      ok: true,
      user: { id, full_name: full_name.trim(), role },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
    });
    return res;
  } catch (error) {
    console.error("Kayıt olma hatası:", error);
    return NextResponse.json({ error: "Kayıt işlemi sırasında bir hata oluştu." }, { status: 500 });
  }
}
