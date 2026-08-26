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
import { withApiTiming } from "@/lib/performance";
import { writeAuditLog } from "@/lib/audit";
import { MAX_AUTH_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";

export const dynamic = "force-dynamic";

async function postLogin(req: NextRequest) {
  try {
    const bodyResult = await parseJsonBodyLimited(req, MAX_AUTH_REQUEST_BYTES);
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.tooLarge ? "Giriş isteği izin verilen boyutu aşıyor." : "Geçersiz giriş verisi." },
        { status: bodyResult.tooLarge ? 413 : 400 },
      );
    }
    const parsed = loginSchema.safeParse(bodyResult.value);
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

    try {
      await writeAuditLog(db, {
        user,
        action: "login",
        entity: "user",
        entityId: user._id,
        summary: `${user.full_name} giriş yaptı`,
      });
    } catch (auditError) {
      console.error("Giriş audit kaydı yazılamadı:", auditError instanceof Error ? auditError.name : "UnknownError");
    }

    const token = await createSessionToken(user._id, user.session_version);
    const isTechnician = user.role === "teknisyen" || user.role === "planlamaci";
    const technician_type = isTechnician ? normalizeTechnicianType(user.technician_type) : undefined;
    const technicianPermissions = isTechnician ? normalizeTechnicianPermissions(user, technician_type ?? "mekanik") : undefined;
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
    console.error("Giriş hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Giriş sırasında bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/auth/login", () => postLogin(req), { request: req });
}
