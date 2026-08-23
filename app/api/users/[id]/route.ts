import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers, normalizeRole } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { normalizeTechnicianPermissions, normalizeTechnicianType } from "@/lib/technicians";

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, usersCol, user, response } = await getAuthorizedAdmin(req);
  if (response) return response;

  const { role, active, approved, phone, technician_type, can_be_responsible, can_be_support, allowed_work_domains } = await req.json();
  if (user._id === id && (active === false || approved === false)) {
    return NextResponse.json({ error: "Kendi yönetici erişiminizi pasifleştiremez veya onayını kaldıramazsınız." }, { status: 400 });
  }
  const update: Record<string, any> = {};
  const unset: Record<string, any> = {};
  if (role !== undefined) {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) return NextResponse.json({ error: "Geçersiz kullanıcı rolü." }, { status: 400 });
    update.role = normalizedRole;
    if (normalizedRole === "teknisyen") {
      const normalizedType = normalizeTechnicianType(technician_type);
      update.technician_type = normalizedType;
      Object.assign(update, normalizeTechnicianPermissions({ can_be_responsible, can_be_support, allowed_work_domains }, normalizedType));
    } else {
      unset.technician_type = "";
      unset.can_be_responsible = "";
      unset.can_be_support = "";
      unset.allowed_work_domains = "";
    }
  }
  if (role === undefined && (technician_type !== undefined || can_be_responsible !== undefined || can_be_support !== undefined || allowed_work_domains !== undefined)) {
    const target = await usersCol.findOne({ _id: id }, { projection: { role: 1, technician_type: 1, can_be_responsible: 1, can_be_support: 1, allowed_work_domains: 1 } });
    if (!target || normalizeRole(target.role) !== "teknisyen") {
      return NextResponse.json({ error: "Teknisyen yetkileri yalnızca teknisyen hesaplarına atanabilir." }, { status: 400 });
    }
    const previousType = normalizeTechnicianType(target.technician_type);
    const normalizedType = normalizeTechnicianType(technician_type ?? target.technician_type);
    const typeChanged = technician_type !== undefined && normalizedType !== previousType;
    update.technician_type = normalizedType;
    Object.assign(update, normalizeTechnicianPermissions({ can_be_responsible: can_be_responsible ?? (typeChanged ? undefined : target.can_be_responsible), can_be_support: can_be_support ?? (typeChanged ? undefined : target.can_be_support), allowed_work_domains: allowed_work_domains ?? (typeChanged ? undefined : target.allowed_work_domains) }, normalizedType));
  }
  if (typeof active === "boolean") update.active = active;
  if (typeof approved === "boolean") update.approved = approved;
  if (phone !== undefined) {
    if (typeof phone !== "string" || !isValidPhone(phone)) {
      return NextResponse.json({ error: "Geçerli bir Türkiye telefon numarası girin." }, { status: 400 });
    }
    const normalizedPhone = normalizePhone(phone);
    const duplicate = await usersCol.findOne({ $or: [{ phone_normalized: normalizedPhone }, { phone: normalizedPhone }], _id: { $ne: id } });
    if (duplicate) return NextResponse.json({ error: "Bu telefon numarası başka bir kullanıcıda kayıtlı." }, { status: 409 });
    update.phone = phone.trim();
    update.phone_normalized = normalizedPhone;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Güncellenecek alan bulunamadı." }, { status: 400 });

  const before = await usersCol.findOne({ _id: id }, { projection: { password_hash: 0 } });
  if (!before) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  const result = await usersCol.updateOne({ _id: id }, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  if (result.matchedCount === 0) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  await writeAuditLog(db, {
    user, action: "update", entity: "user", entityId: id,
    summary: `${before.full_name || "Kullanıcı"} hesabı güncellendi.`, before, after: { ...update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { usersCol, user, response } = await getAuthorizedAdmin(req);
  if (response) return response;
  if (user._id === id) return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz." }, { status: 400 });

  const result = await usersCol.deleteOne({ _id: id });
  if (result.deletedCount === 0) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
