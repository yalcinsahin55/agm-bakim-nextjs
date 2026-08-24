import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { verifyPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { enforceCompositeRateLimit } from "@/lib/apiRateLimit";
import { getClientIp } from "@/lib/rate-limit";
import { loginSchema, formatZodError } from "@/lib/schemas";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { normalizeTechnicianPermissions, normalizeTechnicianType } from "@/lib/technicians";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { password } = parsed.data;
    const identifier = parsed.data.identifier || parsed.data.phone || parsed.data.email || "";
    const normalizedIdentifier = isValidPhone(identifier) ? normalizePhone(identifier) : identifier.toLowerCase().trim();
    // 🔒 IP ve gerçek normalize edilmiş identifier limitleri tek Redis kararında uygulanır.
    const clientIp = getClientIp(req);
    const rateLimited = await enforceCompositeRateLimit(req, [
      { scope: "login-ip", limit: 5, windowMs: 10 * 60 * 1000, identity: clientIp },
      { scope: "login-identifier", limit: 8, windowMs: 10 * 60 * 1000, identity: normalizedIdentifier },
    ]);
    if (rateLimited) return rateLimited;

    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await usersCol.findOne({
      $or: [{ _id: normalizedIdentifier }, { email: normalizedIdentifier }, { phone_normalized: normalizedIdentifier }, { phone: normalizedIdentifier }],
    });

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "Telefon numarası/e-posta veya şifre hatalı." }, { status: 401 });
    }

    if (user.approved === false) {
      return NextResponse.json({ error: "Hesabınız yönetici onayı bekliyor. Onay verildiğinde giriş yapabilirsiniz." }, { status: 403 });
    }

    if (user.active === false) {
      return NextResponse.json({ error: "Hesabınız pasif durumda. Yöneticinizle iletişime geçin." }, { status: 403 });
    }

    const token = await createSessionToken(user._id);
    const isTechnician = user.role === "teknisyen" || user.role === "planlamaci";
    const technician_type = isTechnician ? normalizeTechnicianType(user.technician_type) : undefined;
    const technicianPermissions = isTechnician ? normalizeTechnicianPermissions(user, technician_type) : undefined;
    const res = NextResponse.json({
      ok: true,
      user: { id: user._id, full_name: user.full_name, phone: user.phone || user.phone_normalized, email: user.email, role: user.role, technician_type, ...(technicianPermissions || {}) },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  } catch (error) {
    console.error("Giriş hatası:", error);
    return NextResponse.json({ error: "Giriş sırasında bir hata oluştu." }, { status: 500 });
  }
}
