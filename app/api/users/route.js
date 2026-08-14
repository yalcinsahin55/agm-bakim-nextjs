import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") return NextResponse.json({ error: "Bu sayfa yalnızca yöneticiler içindir." }, { status: 403 });

  const users = await usersCol.find().toArray();
  return NextResponse.json(users.map((u) => ({
    id: u._id, full_name: u.full_name, email: u.email, role: u.role, active: u.active !== false, created_at: u.created_at,
  })));
}

export async function POST(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });

  const { full_name, email, password, role } = await req.json();
  if (!full_name || !email || !password || password.length < 6) {
    return NextResponse.json({ error: "Lütfen tüm alanları doldurun (şifre en az 6 karakter)." }, { status: 400 });
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
}
