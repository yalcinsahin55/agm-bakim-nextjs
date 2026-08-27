import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser, hashPassword, SESSION_COOKIE } from "@/lib/auth";
import { usersCollection } from "@/lib/dbCollections";
import { canManageUsers } from "@/lib/permissions";
import { passwordResetSchema, formatZodError } from "@/lib/schemas";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { writeAuditLog } from "@/lib/audit";
import { withApiTiming } from "@/lib/performance";
import { MAX_SMALL_JSON_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";

export const dynamic = "force-dynamic";

function currentSessionVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : 0;
}

async function postResetPassword(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canManageUsers(user.role)) return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });

  const rateLimited = await enforceApiRateLimit(req, "user-password-reset", 20, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const bodyResult = await parseJsonBodyLimited(req, MAX_SMALL_JSON_REQUEST_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.tooLarge ? "Şifre sıfırlama isteği izin verilen boyutu aşıyor." : "Geçersiz şifre sıfırlama verisi." },
      { status: bodyResult.tooLarge ? 413 : 400 },
    );
  }
  const parsed = passwordResetSchema.safeParse(bodyResult.value);
  if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });

  const target = await usersCol.findOne({ _id: id }, { projection: { password_hash: 0 } });
  if (!target) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });

  const targetVersion = currentSessionVersion(target.session_version);
  const nextSessionVersion = targetVersion + 1;
  const passwordHash = await hashPassword(parsed.data.new_password);
  const result = await usersCol.updateOne(
    { _id: id, $or: [{ session_version: targetVersion }, { session_version: { $exists: false } }] },
    { $set: { password_hash: passwordHash, session_version: nextSessionVersion } },
  );
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Hesap aynı anda güncellendi. Lütfen tekrar deneyin." }, { status: 409 });
  }

  await writeAuditLog(db, {
    user,
    action: "update",
    entity: "user",
    entityId: id,
    summary: `${target.full_name || "Kullanıcı"} hesabının şifresi yönetici tarafından sıfırlandı.`,
    after: { session_version: nextSessionVersion },
  });

  const selfReset = user._id === id;
  const response = NextResponse.json({ ok: true, requiresLogin: selfReset });
  if (selfReset) {
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }
  return response;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("POST /api/users/[id]/reset-password", () => postResetPassword(req, context), { request: req });
}
