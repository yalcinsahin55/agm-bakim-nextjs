import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { adminUserSchema, formatZodError } from "@/lib/schemas";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { normalizeTechnicianPermissions, normalizeTechnicianType } from "@/lib/technicians";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!canManageUsers(user.role)) return NextResponse.json({ error: "Bu sayfa yalnızca yöneticiler içindir." }, { status: 403 });
    const rateLimited = await enforceApiRateLimit(req, "user-list", 60, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const users = await usersCol.find().toArray();
    return NextResponse.json(users.map((u) => {
      const isTechnician = u.role === "teknisyen" || u.role === "planlamaci";
      const technician_type = isTechnician ? normalizeTechnicianType(u.technician_type) : undefined;
      const permissions = isTechnician ? normalizeTechnicianPermissions(u, technician_type) : undefined;
      return {
        id: u._id, full_name: u.full_name, email: u.email || "", phone: u.phone || u.phone_normalized || "", role: u.role,
        technician_type, ...(permissions || {}),
        active: u.active !== false, approved: u.approved !== false, created_at: u.created_at,
      };
    }));
  } catch (error) {
    console.error("Kullanıcılar getirilirken hata:", error);
    return NextResponse.json({ error: "Kullanıcı listesi yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureAppIndexes(db);
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!canManageUsers(user.role)) return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
    const rateLimited = await enforceApiRateLimit(req, "user-create", 30, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const parsed = adminUserSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { full_name, phone, password, role, technician_type, can_be_responsible, can_be_support, allowed_work_domains } = parsed.data;
    const normalizedTechnicianType = role === "teknisyen" ? normalizeTechnicianType(technician_type) : undefined;
    const technicianPermissions = normalizedTechnicianType ? normalizeTechnicianPermissions({ can_be_responsible, can_be_support, allowed_work_domains }, normalizedTechnicianType) : undefined;
    if (!isValidPhone(phone)) {
      return NextResponse.json({ error: "Geçerli bir Türkiye telefon numarası girin (05xx xxx xx xx)." }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    const existing = await usersCol.findOne({ $or: [{ _id: normalizedPhone }, { phone_normalized: normalizedPhone }, { phone: normalizedPhone }] });
    if (existing) return NextResponse.json({ error: "Bu telefon numarası zaten kayıtlı." }, { status: 409 });

    const passwordHash = await hashPassword(password);
    await usersCol.insertOne({
      _id: normalizedPhone, full_name: full_name.trim(), phone: phone.trim(), phone_normalized: normalizedPhone, email: "",
      password_hash: passwordHash, role, ...(normalizedTechnicianType ? { technician_type: normalizedTechnicianType, ...technicianPermissions } : {}), active: true, approved: false, created_at: new Date(),
    });
    await writeAuditLog(db, {
      user, action: "create", entity: "user", entityId: normalizedPhone,
      summary: `${full_name.trim()} kullanıcısı oluşturuldu; yönetici onayı bekliyor.`,
      after: { full_name: full_name.trim(), phone: normalizedPhone, role, ...(normalizedTechnicianType ? { technician_type: normalizedTechnicianType, ...technicianPermissions } : {}), active: true, approved: false },
    });
    return NextResponse.json({ ok: true, approved: false });
  } catch (error) {
    console.error("Kullanıcı eklenirken hata:", error);
    return NextResponse.json({ error: "Kullanıcı eklenirken bir hata oluştu." }, { status: 500 });
  }
}
