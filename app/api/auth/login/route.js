import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { verifyPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { loginSchema, formatZodError } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(req) {
  // 🔒 IP başına 10 dakikada en fazla 5 giriş denemesi
  const rl = checkRateLimit(`login:${getClientIp(req)}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Çok fazla deneme. Lütfen ${Math.ceil(rl.retryAfterMs / 1000)} saniye sonra tekrar deneyin.` },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await usersCol.findOne({ _id: email.toLowerCase() });

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "E-posta veya şifre hatalı." }, { status: 401 });
    }

    if (!user.active) {
      return NextResponse.json({ error: "Hesabınız pasif durumda. Yöneticinizle iletişime geçin." }, { status: 403 });
    }

    const token = await createSessionToken(user._id);
    const res = NextResponse.json({
      ok: true,
      user: { id: user._id, full_name: user.full_name, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  } catch (error) {
    console.error("Giriş hatası:", error);
    return NextResponse.json({ error: "Giriş sırasında bir hata oluştu." }, { status: 500 });
  }
}
