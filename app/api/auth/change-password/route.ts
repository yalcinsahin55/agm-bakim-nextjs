import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser, hashPassword, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { usersCollection } from "@/lib/dbCollections";
import { passwordChangeSchema, formatZodError } from "@/lib/schemas";
import { enforceCompositeRateLimit } from "@/lib/apiRateLimit";
import { getClientIp } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { withApiTiming } from "@/lib/performance";
import { MAX_AUTH_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";

export const dynamic = "force-dynamic";

function currentSessionVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : 0;
}

async function postChangePassword(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const rateLimited = await enforceCompositeRateLimit(req, [
    { scope: "password-change-ip", limit: 10, windowMs: 10 * 60 * 1000, identity: getClientIp(req) },
    { scope: "password-change-user", limit: 5, windowMs: 10 * 60 * 1000, identity: user._id },
  ]);
  if (rateLimited) return rateLimited;

  const bodyResult = await parseJsonBodyLimited(req, MAX_AUTH_REQUEST_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.tooLarge ? "Şifre değiştirme isteği izin verilen boyutu aşıyor." : "Geçersiz şifre değiştirme verisi." },
      { status: bodyResult.tooLarge ? 413 : 400 },
    );
  }
  const parsed = passwordChangeSchema.safeParse(bodyResult.value);
  if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });

  const { current_password, new_password } = parsed.data;
  if (current_password === new_password) {
    return NextResponse.json({ error: "Yeni şifre mevcut şifreden farklı olmalıdır." }, { status: 400 });
  }
  if (!(await verifyPassword(current_password, user.password_hash))) {
    return NextResponse.json({ error: "Mevcut şifre hatalı." }, { status: 400 });
  }

  const nextSessionVersion = currentSessionVersion(user.session_version) + 1;
  const passwordHash = await hashPassword(new_password);
  const result = await usersCol.updateOne(
    { _id: user._id, $or: [{ session_version: currentSessionVersion(user.session_version) }, { session_version: { $exists: false } }] },
    { $set: { password_hash: passwordHash, session_version: nextSessionVersion } },
  );
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Hesap aynı anda güncellendi. Lütfen tekrar deneyin." }, { status: 409 });
  }

  await writeAuditLog(db, {
    user,
    action: "update",
    entity: "user",
    entityId: user._id,
    summary: `${user.full_name || "Kullanıcı"} şifresini değiştirdi.`,
    after: { session_version: nextSessionVersion },
  });

  const response = NextResponse.json({ ok: true, requiresLogin: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/auth/change-password", () => postChangePassword(req), { request: req });
}
