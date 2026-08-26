import { usersCollection } from "@/lib/dbCollections";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { registerSchema, formatZodError } from "@/lib/schemas";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { withApiTiming } from "@/lib/performance";
import { MAX_AUTH_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";

export const dynamic = "force-dynamic";

async function postRegister(req: NextRequest) {
  // 🔒 IP başına 10 dakikada en fazla 3 kayıt denemesi
  const rateLimited = await enforceApiRateLimit(req, "register", 3, 10 * 60 * 1000);
  if (rateLimited) return rateLimited;

  try {
    const bodyResult = await parseJsonBodyLimited(req, MAX_AUTH_REQUEST_BYTES);
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.tooLarge ? "Kayıt isteği izin verilen boyutu aşıyor." : "Geçersiz kayıt verisi." },
        { status: bodyResult.tooLarge ? 413 : 400 },
      );
    }
    const parsed = registerSchema.safeParse(bodyResult.value);
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
    await ensureAppIndexes(db);
    const usersCol = usersCollection(db);
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
      _id: id, stable_id: randomUUID(), full_name: full_name.trim(), email: normalizedEmail,
      ...(normalizedPhone ? { phone: phone?.trim(), phone_normalized: normalizedPhone } : {}),
      password_hash: passwordHash, role: "yonetici", active: true, approved: true, bootstrap_key: "first-user", created_at: new Date(),
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
    console.error("Kayıt olma hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Kayıt işlemi sırasında bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/auth/register", () => postRegister(req), { request: req });
}
