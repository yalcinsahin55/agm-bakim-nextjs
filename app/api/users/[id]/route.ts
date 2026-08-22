import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { isValidPhone, normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

async function getAuthorizedAdmin(req: NextRequest) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return { db, usersCol, response: NextResponse.json({ error: "Giriş gerekli" }, { status: 401 }) };
  if (!canManageUsers(user.role)) {
    return { db, usersCol, response: NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 }) };
  }
  return { db, usersCol, user };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { db, usersCol, user, response } = await getAuthorizedAdmin(req);
  if (response) return response;

  const { role, active, approved, phone } = await req.json();
  if (user._id === params.id && (active === false || approved === false)) {
    return NextResponse.json({ error: "Kendi yönetici erişiminizi pasifleştiremez veya onayını kaldıramazsınız." }, { status: 400 });
  }
  const update: Record<string, any> = {};
  if (role) update.role = role;
  if (typeof active === "boolean") update.active = active;
  if (typeof approved === "boolean") update.approved = approved;
  if (phone !== undefined) {
    if (typeof phone !== "string" || !isValidPhone(phone)) {
      return NextResponse.json({ error: "Geçerli bir Türkiye telefon numarası girin." }, { status: 400 });
    }
    const normalizedPhone = normalizePhone(phone);
    const duplicate = await usersCol.findOne({ $or: [{ phone_normalized: normalizedPhone }, { phone: normalizedPhone }], _id: { $ne: params.id } });
    if (duplicate) return NextResponse.json({ error: "Bu telefon numarası başka bir kullanıcıda kayıtlı." }, { status: 409 });
    update.phone = phone.trim();
    update.phone_normalized = normalizedPhone;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Güncellenecek alan bulunamadı." }, { status: 400 });

  const before = await usersCol.findOne({ _id: params.id }, { projection: { password_hash: 0 } });
  if (!before) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  const result = await usersCol.updateOne({ _id: params.id }, { $set: update });
  if (result.matchedCount === 0) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  await writeAuditLog(db, {
    user, action: "update", entity: "user", entityId: params.id,
    summary: `${before.full_name || "Kullanıcı"} hesabı güncellendi.`, before, after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { usersCol, user, response } = await getAuthorizedAdmin(req);
  if (response) return response;
  if (user._id === params.id) return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz." }, { status: 400 });

  const result = await usersCol.deleteOne({ _id: params.id });
  if (result.deletedCount === 0) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
