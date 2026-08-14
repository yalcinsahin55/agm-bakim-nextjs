import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json();
  const { full_name, email, password } = body;

  if (!full_name || !email || !password || password.length < 6) {
    return NextResponse.json({ error: "Lütfen tüm alanları doldurun (şifre en az 6 karakter olmalı)." }, { status: 400 });
  }

  const db = await getDb();
  const usersCol = db.collection("users");

  const id = email.toLowerCase().trim();
  const existing = await usersCol.findOne({ _id: id });
  if (existing) {
    return NextResponse.json({ error: "Bu e-posta zaten kayıtlı." }, { status: 409 });
  }

  // Sistemde hiç kullanıcı yoksa ilk kaydolan otomatik yönetici olur.
  const userCount = await usersCol.countDocuments();
  const role = userCount === 0 ? "yonetici" : "teknisyen";

  const passwordHash = await hashPassword(password);
  await usersCol.insertOne({
    _id: id,
    full_name: full_name.trim(),
    email: id,
    password_hash: passwordHash,
    role,
    active: true,
    created_at: new Date(),
  });

  const token = await createSessionToken(id);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
  });
  return res;
}
