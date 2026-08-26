import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers, normalizeRole } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { normalizeTechnicianPermissions, normalizeTechnicianType } from "@/lib/technicians";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { withApiTiming } from "@/lib/performance";
import type { UserDocument } from "@/lib/dbTypes";
import { MAX_SMALL_JSON_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";

export const dynamic = "force-dynamic";

type UserUpdateFields = Partial<Pick<UserDocument, "role" | "active" | "approved" | "phone" | "phone_normalized" | "session_version" | "technician_type" | "can_be_responsible" | "can_be_support" | "allowed_work_domains">>;

async function getAuthorizedAdmin(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
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
  const rateLimited = await enforceApiRateLimit(req, "user-update", 60, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const patchBodyResult = await parseJsonBodyLimited(req, MAX_SMALL_JSON_REQUEST_BYTES);
  if (!patchBodyResult.ok) {
    return NextResponse.json(
      { error: patchBodyResult.tooLarge ? "Kullanıcı güncelleme isteği izin verilen boyutu aşıyor." : "Geçersiz kullanıcı verisi." },
      { status: patchBodyResult.tooLarge ? 413 : 400 },
    );
  }
  const patchBody = patchBodyResult.value;
  const { role, active, approved, phone, technician_type, can_be_responsible, can_be_support, allowed_work_domains } =
    typeof patchBody === "object" && patchBody !== null && !Array.isArray(patchBody)
      ? patchBody as Record<string, unknown>
      : {};
  const roleValue = typeof role === "string" ? role : undefined;
  const activeValue = typeof active === "boolean" ? active : undefined;
  const approvedValue = typeof approved === "boolean" ? approved : undefined;
  const technicianTypeValue = typeof technician_type === "string" ? technician_type : undefined;
  const canBeResponsibleValue = typeof can_be_responsible === "boolean" ? can_be_responsible : undefined;
  const canBeSupportValue = typeof can_be_support === "boolean" ? can_be_support : undefined;
  const allowedWorkDomainsValue = Array.isArray(allowed_work_domains)
    ? allowed_work_domains.filter((domain): domain is "mechanical" | "electrical" | "commissioning" => domain === "mechanical" || domain === "electrical" || domain === "commissioning")
    : undefined;
  if (user._id === id && (activeValue === false || approvedValue === false)) {
    return NextResponse.json({ error: "Kendi yönetici erişiminizi pasifleştiremez veya onayını kaldıramazsınız." }, { status: 400 });
  }
  const update: UserUpdateFields = {};
  const unset: Record<string, ""> = {};
  if (roleValue !== undefined) {
    const normalizedRole = normalizeRole(roleValue);
    if (!normalizedRole) return NextResponse.json({ error: "Geçersiz kullanıcı rolü." }, { status: 400 });
    update.role = normalizedRole;
    if (normalizedRole === "teknisyen") {
      const normalizedType = normalizeTechnicianType(technicianTypeValue);
      update.technician_type = normalizedType;
      Object.assign(update, normalizeTechnicianPermissions({ can_be_responsible: canBeResponsibleValue, can_be_support: canBeSupportValue, allowed_work_domains: allowedWorkDomainsValue }, normalizedType));
    } else {
      unset.technician_type = "";
      unset.can_be_responsible = "";
      unset.can_be_support = "";
      unset.allowed_work_domains = "";
    }
  }
  if (roleValue === undefined && (technicianTypeValue !== undefined || canBeResponsibleValue !== undefined || canBeSupportValue !== undefined || allowedWorkDomainsValue !== undefined)) {
    const target = await usersCol.findOne({ _id: id }, { projection: { role: 1, technician_type: 1, can_be_responsible: 1, can_be_support: 1, allowed_work_domains: 1 } });
    if (!target || normalizeRole(target.role) !== "teknisyen") {
      return NextResponse.json({ error: "Teknisyen yetkileri yalnızca teknisyen hesaplarına atanabilir." }, { status: 400 });
    }
    const previousType = normalizeTechnicianType(target.technician_type);
    const normalizedType = normalizeTechnicianType(technicianTypeValue ?? target.technician_type);
    const typeChanged = technicianTypeValue !== undefined && normalizedType !== previousType;
    update.technician_type = normalizedType;
    Object.assign(update, normalizeTechnicianPermissions({ can_be_responsible: canBeResponsibleValue ?? (typeChanged ? undefined : target.can_be_responsible), can_be_support: canBeSupportValue ?? (typeChanged ? undefined : target.can_be_support), allowed_work_domains: allowedWorkDomainsValue ?? (typeChanged ? undefined : target.allowed_work_domains) }, normalizedType));
  }
  if (activeValue !== undefined) update.active = activeValue;
  if (approvedValue !== undefined) update.approved = approvedValue;
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
  const currentSessionVersion = typeof before.session_version === "number" && Number.isInteger(before.session_version) && before.session_version >= 0 ? before.session_version : 0;
  update.session_version = currentSessionVersion + 1;
  const result = await usersCol.updateOne({ _id: id }, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  if (result.matchedCount === 0) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  await writeAuditLog(db, {
    user, action: "update", entity: "user", entityId: id,
    summary: `${before.full_name || "Kullanıcı"} hesabı güncellendi.`, before, after: { ...update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  });
  return NextResponse.json({ ok: true });
}

async function deleteUser(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, usersCol, user, response } = await getAuthorizedAdmin(req);
  if (response) return response;
  const rateLimited = await enforceApiRateLimit(req, "user-delete", 20, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;
  if (user._id === id) return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz." }, { status: 400 });

  const deleteBodyResult = await parseJsonBodyLimited(req, MAX_SMALL_JSON_REQUEST_BYTES);
  if (!deleteBodyResult.ok) {
    return NextResponse.json(
      { error: deleteBodyResult.tooLarge ? "Kullanıcı silme isteği izin verilen boyutu aşıyor." : "Geçersiz silme onayı verisi." },
      { status: deleteBodyResult.tooLarge ? 413 : 400 },
    );
  }
  const deleteBody = deleteBodyResult.value;
  const confirmation = deleteBody && typeof deleteBody === "object" && !Array.isArray(deleteBody)
    ? (deleteBody as { confirm?: unknown }).confirm
    : undefined;
  if (confirmation !== "DELETE") {
    return NextResponse.json({ error: "Kalıcı silme için DELETE onayı gereklidir." }, { status: 400 });
  }

  const before = await usersCol.findOne({ _id: id }, { projection: { password_hash: 0 } });
  if (!before) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });

  if (normalizeRole(before.role) === "yonetici") {
    const remainingActiveManagers = await usersCol.countDocuments({
      _id: { $ne: id },
      role: "yonetici",
      active: { $ne: false },
      approved: { $ne: false },
    });
    if (remainingActiveManagers === 0) {
      return NextResponse.json({ error: "Sistemde en az bir aktif yönetici hesabı kalmalıdır." }, { status: 400 });
    }
  }

  const deletedAt = new Date();
  const result = await usersCol.deleteOne({ _id: id });
  if (result.deletedCount === 0) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  await writeAuditLog(db, {
    user,
    action: "delete",
    entity: "user",
    entityId: id,
    summary: `${before.full_name || "Kullanıcı"} hesabı kalıcı olarak silindi; geçmiş bakım kayıtları korundu.`,
    before,
    after: { deleted: true, deleted_at: deletedAt },
  });
  return NextResponse.json({ ok: true, deleted: true });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("DELETE /api/users/[id]", () => deleteUser(req, context), { request: req });
}
