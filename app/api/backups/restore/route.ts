import { NextResponse, type NextRequest } from "next/server";
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { RESTORE_COLLECTIONS, cleanRestoredValue, computeBackupChecksum, getRestoreIdentity, type RestorableDocument } from "@/lib/backupFormat";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { MAX_BACKUP_REQUEST_BYTES, readRequestTextLimited, RequestBodyTooLargeError } from "@/lib/requestLimits";
import { withApiTiming } from "@/lib/performance";
import { usersCollection } from "@/lib/dbCollections";

export const dynamic = "force-dynamic";

const RESTORE_BATCH_SIZE = 500;

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
    const integrity = body.integrity;
    if (integrity !== undefined) {
      if (!integrity || typeof integrity !== "object" || Array.isArray(integrity)) return NextResponse.json({ error: "Geçersiz yedek bütünlük bilgisi." }, { status: 400 });
      const integrityRecord = integrity as Record<string, unknown>;
      if (integrityRecord.algorithm !== "sha256" || typeof integrityRecord.value !== "string" || !/^[a-f0-9]{64}$/i.test(integrityRecord.value)) {
        return NextResponse.json({ error: "Geçersiz yedek checksum bilgisi." }, { status: 400 });
      }
      if (computeBackupChecksum(collections) !== integrityRecord.value.toLowerCase()) {
        return NextResponse.json({ error: "Yedek checksum doğrulaması başarısız." }, { status: 400 });
      }
    }
    const dryRun = body.dry_run === true;

    const summary: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    for (const name of RESTORE_COLLECTIONS) {
      const documents = Array.isArray((collections as Record<string, unknown>)[name]) ? (collections as Record<string, unknown[]>)[name] : [];
      if (documents.length > 50000) return NextResponse.json({ error: `${name} koleksiyonu çok büyük.` }, { status: 413 });
      const operations: AnyBulkWriteOperation<RestorableDocument>[] = [];
      let count = 0;
      let skippedCount = 0;
      for (const raw of documents) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          skippedCount += 1;
          continue;
        }
        const document = cleanRestoredValue(raw) as RestorableDocument;
        const identity = getRestoreIdentity(document);
        if (identity) {
          const rawIdentity = document._id;
          delete document._id;
          const mongoIdentity = rawIdentity instanceof ObjectId ? rawIdentity : identity;
          operations.push({
            updateOne: {
              filter: { _id: mongoIdentity },
              update: { $set: document, $setOnInsert: { _id: mongoIdentity } },
              upsert: true,
            },
          });
        } else {
          delete document._id;
          operations.push({ insertOne: { document } });
        }
        count += 1;
      }

      if (!dryRun) {
        const collection = db.collection<RestorableDocument>(name);
        for (let offset = 0; offset < operations.length; offset += RESTORE_BATCH_SIZE) {
          await collection.bulkWrite(operations.slice(offset, offset + RESTORE_BATCH_SIZE), { ordered: true });
        }
      }
      summary[name] = count;
      skipped[name] = skippedCount;
    }

    if (dryRun) {
      return NextResponse.json({ ok: true, summary, skipped, mode: "dry-run", applied: false });
    }

    await writeAuditLog(db, {
      user,
      action: "update",
      entity: "database",
      summary: "Sanitized uygulama yedeği batch merge modunda geri yüklendi",
      after: { summary, skipped, restoredAt: new Date().toISOString(), mode: "merge", batchSize: RESTORE_BATCH_SIZE },
    });
    return NextResponse.json({ ok: true, summary, skipped, mode: "merge" });
  } catch (error) {
    console.error("POST /api/backups/restore hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Yedek geri yüklenemedi. Dosya biçimini kontrol edin." }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/backups/restore", () => postBackupRestore(req), { request: req });
}
