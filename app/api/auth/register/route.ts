import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { registerSchema, formatZodError } from "@/lib/schemas";
import { isValidPhone, normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 🔒 IP başına 10 dakikada en fazla 3 kayıt denemesi
  const rateLimited = await enforceApiRateLimit(req, "register", 3, 10 * 60 * 1000);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json().catch(() => ({}));

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { full_name, email, phone, password } = parsed.data;
    const normalizedPhone = phone ? normalizePhone(phone) : "";
    const normalizedEmail = email ? email.toLowerCase().trim() : "";
    if (phone && !isValidPhone(phone)) {
      return NextResponse.json({ error: "Geçerli bir Türkiye telefon numarası girin." }, { status: 400 });
    }

    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const id = normalizedPhone || normalizedEmail;

    const existing = await usersCol.findOne({
      $or: [{ _id: id }, { phone: normalizedPhone }, { email: normalizedEmail }],
    });
    if (existing) {
      return NextResponse.json({ error: "Bu telefon numarası veya e-posta zaten kullanılıyor." }, { status: 409 });
    }

    // 🔐 GÜVENLİK: Sistemde kullanıcı varken halka açık kayıt KAPALIDIR.
    // Yeni hesapları yalnızca yönetici, Kullanıcılar sayfasından açar.
    const userCount = await usersCol.countDocuments();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Yeni hesap oluşturma kapalıdır. Lütfen yöneticinizle iletişime geçin." },
        { status: 403 }
      );
    }

    // İlk kurulum: ilk kullanıcı yönetici olur
    const passwordHash = await hashPassword(password);
    await usersCol.insertOne({
      _id: id, full_name: full_name.trim(), email: normalizedEmail,
      ...(normalizedPhone ? { phone: phone?.trim(), phone_normalized: normalizedPhone } : {}),
      password_hash: passwordHash, role: "yonetici", active: true, approved: true, created_at: new Date(),
    });

    const token = await createSessionToken(id);
    const res = NextResponse.json({ ok: true, user: { id, full_name, phone: normalizedPhone, email: normalizedEmail, role: "yonetici" } });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  } catch (error) {
    console.error("Kayıt olma hatası:", error);
    return NextResponse.json({ error: "Kayıt işlemi sırasında bir hata oluştu." }, { status: 500 });
  }
}
