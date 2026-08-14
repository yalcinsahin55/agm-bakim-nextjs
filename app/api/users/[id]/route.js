import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getAuthorizedAdmin(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return { db, usersCol, response: NextResponse.json({ error: "Giriş gerekli" }, { status: 401 }) };
  if (user.role !== "yonetici") {
    return { db, usersCol, response: NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 }) };
  }
  return { db, usersCol, user };
}

export async function PATCH(req, { params }) {
  const { usersCol, response } = await getAuthorizedAdmin(req);
  if (response) return response;

  const { role, active } = await req.json();
  const update = {};
  if (role) update.role = role;
  if (typeof active === "boolean") update.active = active;

  const result = await usersCol.updateOne({ _id: params.id }, { $set: update });
  if (result.matchedCount === 0) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const { usersCol, user, response } = await getAuthorizedAdmin(req);
  if (response) return response;
  if (user._id === params.id) return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz." }, { status: 400 });

  const result = await usersCol.deleteOne({ _id: params.id });
  if (result.deletedCount === 0) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
