import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { adminUserSchema, formatZodError } from "@/lib/schemas";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { ensureAppIndexes } from "@/lib/dbIndexes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!canManageUsers(user.role)) return NextResponse.json({ error: "Bu sayfa yalnızca yöneticiler içindir." }, { status: 403 });

    const users = await usersCol.find().toArray();
    return NextResponse.json(users.map((u: any) => ({
      id: u._id, full_name: u.full_name, email: u.email || "", phone: u.phone || u.phone_normalized || "", role: u.role,
      active: u.active !== false, approved: u.approved !== false, created_at: u.created_at,
    })));
  } catch (error) {
    console.error("Kullanıcılar getirilirken hata:", error);
    return NextResponse.json({ error: "Kullanıcı listesi yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureAppIndexes(db);
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!canManageUsers(user.role)) return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });

    const parsed = adminUserSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { full_name, phone, password, role } = parsed.data;
    if (!isValidPhone(phone)) {
      return NextResponse.json({ error: "Geçerli bir Türkiye telefon numarası girin (05xx xxx xx xx)." }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    const existing = await usersCol.findOne({ $or: [{ _id: normalizedPhone }, { phone_normalized: normalizedPhone }, { phone: normalizedPhone }] });
    if (existing) return NextResponse.json({ error: "Bu telefon numarası zaten kayıtlı." }, { status: 409 });

    const passwordHash = await hashPassword(password);
    await usersCol.insertOne({
      _id: normalizedPhone, full_name: full_name.trim(), phone: phone.trim(), phone_normalized: normalizedPhone, email: "",
      password_hash: passwordHash, role, active: true, approved: false, created_at: new Date(),
    });
    await writeAuditLog(db, {
      user, action: "create", entity: "user", entityId: normalizedPhone,
      summary: `${full_name.trim()} kullanıcısı oluşturuldu; yönetici onayı bekliyor.`,
      after: { full_name: full_name.trim(), phone: normalizedPhone, role, active: true, approved: false },
    });
    return NextResponse.json({ ok: true, approved: false });
  } catch (error) {
    console.error("Kullanıcı eklenirken hata:", error);
    return NextResponse.json({ error: "Kullanıcı eklenirken bir hata oluştu." }, { status: 500 });
  }
}
