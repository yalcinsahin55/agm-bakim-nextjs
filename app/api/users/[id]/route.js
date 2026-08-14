import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });

  const { role, active } = await req.json();
  const update = {};
  if (role) update.role = role;
  if (typeof active === "boolean") update.active = active;

  await usersCol.updateOne({ _id: params.id }, { $set: update });
  return NextResponse.json({ ok: true });
}
