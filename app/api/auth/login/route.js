import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { verifyPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "E-posta ve şifre gerekli." }, { status: 400 });
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
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
  });
  return res;
}
