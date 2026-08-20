import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { registerSchema, formatZodError } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(req) {
  // 🔒 IP başına 10 dakikada en fazla 3 kayıt denemesi
  const rl = checkRateLimit(`register:${getClientIp(req)}`, 3, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Çok fazla kayıt denemesi. Lütfen ${Math.ceil(rl.retryAfterMs / 1000)} saniye sonra tekrar deneyin.` },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    // 🔒 Zod validasyonu
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { full_name, email, password } = parsed.data;

    const db = await getDb();
    const usersCol = db.collection("users");
    const id = email.toLowerCase();

    const existing = await usersCol.findOne({ _id: id });
    if (existing) {
      return NextResponse.json({ error: "Bu e-posta adresi zaten kullanılıyor." }, { status: 409 });
    }

    // İlk kayıt olan kullanıcı otomatik yönetici olur
    const userCount = await usersCol.countDocuments();
    const role = userCount === 0 ? "yonetici" : "teknisyen";

    const passwordHash = await hashPassword(password);
    await usersCol.insertOne({
      _id: id, full_name, email: id, password_hash: passwordHash,
      role, active: true, created_at: new Date(),
    });

    const token = await createSessionToken(id);
    const res = NextResponse.json({
      ok: true,
      user: { id, full_name, role },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
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
