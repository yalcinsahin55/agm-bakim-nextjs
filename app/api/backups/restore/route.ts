import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMongoClient, getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { MAX_BACKUP_REQUEST_BYTES, readRequestTextLimited, RequestBodyTooLargeError } from "@/lib/requestLimits";
import { withApiTiming } from "@/lib/performance";
import { usersCollection } from "@/lib/dbCollections";
import { isProductionBackupEnvironment, validateBackupIntegrity } from "@/lib/backupFormat";
import { applyRestorePlanMerge, applyRestorePlanTransaction, buildRestorePlan, RestorePlanError } from "@/lib/backupRestore";

export const dynamic = "force-dynamic";

async function postBackupRestore(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canManageUsers(user.role)) return NextResponse.json({ error: "Geri yükleme yetkiniz yok." }, { status: 403 });
  const rateLimited = await enforceApiRateLimit(req, "backup-restore", 2, 60 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  try {
    let bodyText: string;
    try {
      bodyText = await readRequestTextLimited(req, MAX_BACKUP_REQUEST_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: "Yedek dosyası izin verilen boyutu aşıyor." }, { status: 413 });
      }
      throw error;
    }

    const body = JSON.parse(bodyText) as { confirm?: unknown; dry_run?: unknown; collections?: unknown; integrity?: unknown };
    if (body.confirm !== "RESTORE") return NextResponse.json({ error: "Geri yüklemeyi onaylamak için RESTORE yazılmalıdır." }, { status: 400 });
    const collections = body.collections;
    if (!collections || typeof collections !== "object" || Array.isArray(collections)) return NextResponse.json({ error: "Geçersiz yedek dosyası." }, { status: 400 });

    const integrityResult = validateBackupIntegrity(collections, body.integrity, isProductionBackupEnvironment());
    if (!integrityResult.ok) return NextResponse.json({ error: integrityResult.error }, { status: 400 });

    let plan;
    try {
      plan = buildRestorePlan(collections as Record<string, unknown>);
    } catch (error) {
      if (error instanceof RestorePlanError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }

    if (body.dry_run === true) {
      return NextResponse.json({ ok: true, summary: plan.summary, skipped: plan.skipped, mode: "dry-run", applied: false });
    }

    const client = await getMongoClient();
    const production = isProductionBackupEnvironment();
    try {
      if (production) {
        await applyRestorePlanTransaction(client, db, plan);
      } else {
        await applyRestorePlanMerge(db, plan);
      }
    } catch (error) {
      console.error("POST /api/backups/restore apply hatası:", error instanceof Error ? error.name : "UnknownError");
      if (production) {
        return NextResponse.json({ error: "Production geri yüklemesi transaction ile tamamlanamadı; işlem durduruldu. Transaction durumunu kontrol edip gerekirse tekrar deneyin." }, { status: 503 });
      }
      throw error;
    }

    const mode = production ? "transaction" : "merge";
    await writeAuditLog(db, {
      user,
      action: "update",
      entity: "database",
      summary: production ? "Sanitized uygulama yedeği transaction ile geri yüklendi" : "Sanitized uygulama yedeği batch merge modunda geri yüklendi",
      after: { summary: plan.summary, skipped: plan.skipped, restoredAt: new Date().toISOString(), mode, batchSize: 500 },
    });
    return NextResponse.json({ ok: true, summary: plan.summary, skipped: plan.skipped, mode });
  } catch (error) {
    console.error("POST /api/backups/restore hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Yedek geri yüklenemedi. Dosya biçimini kontrol edin." }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/backups/restore", () => postBackupRestore(req), { request: req });
}
