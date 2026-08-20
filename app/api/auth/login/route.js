import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { verifyPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req) {
  // 🔒 Brute-force koruması: IP başına 1 dakikada en fazla 5 deneme
  const rl = checkRateLimit(`login:${getClientIp(req)}`, 5, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Çok fazla giriş denemesi. Lütfen ${Math.ceil(rl.retryAfterMs / 1000)} saniye sonra tekrar deneyin.` },
      { status: 429 }
    );
  }

  try {
    const { email, password } = await req.json();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ error: "Lütfen geçerli bir e-posta adresi girin." }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalıdır." }, { status: 400 });
    }

    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await usersCol.findOne({ _id: email.toLowerCase().trim() });

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "E-posta veya şifre hatalı." }, { status: 401 });
    }
    if (user.active === false) {
      return NextResponse.json({ error: "Hesabınız devre dışı bırakılmış. Yöneticinizle iletişime geçin." }, { status: 403 });
    }

    const token = await createSessionToken(user._id);
    const res = NextResponse.json({
      ok: true,
      user: { id: user._id, full_name: user.full_name, role: user.role },
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
    console.error("Login hatası:", error);
    return NextResponse.json({ error: "Giriş işlemi sırasında beklenmeyen bir hata oluştu." }, { status: 500 });
  }
}
