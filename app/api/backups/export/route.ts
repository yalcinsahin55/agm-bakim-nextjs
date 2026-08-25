import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Document } from "mongodb";
import { BACKUP_COLLECTIONS, sanitizeBackupValue } from "@/lib/backupFormat";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { withApiTiming } from "@/lib/performance";
import { usersCollection } from "@/lib/dbCollections";

export const dynamic = "force-dynamic";

async function getBackupExport(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canManageUsers(user.role)) return NextResponse.json({ error: "Yedek alma yetkiniz yok." }, { status: 403 });
  const rateLimited = await enforceApiRateLimit(req, "backup-export", 3, 15 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const exportedAt = new Date().toISOString();
  await writeAuditLog(db, {
    user,
    action: "export",
    entity: "database",
    summary: "Uygulama veritabanı stream olarak dışa aktarıldı",
    after: { collections: BACKUP_COLLECTIONS, exportedAt, format: "json-stream" },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (value: string) => controller.enqueue(encoder.encode(value));
      try {
        enqueue(`{"version":1,"exportedAt":${JSON.stringify(exportedAt)},"database":${JSON.stringify(db.databaseName)},"collections":{`);
        for (const [index, name] of BACKUP_COLLECTIONS.entries()) {
          if (index > 0) enqueue(",");
          enqueue(`${JSON.stringify(name)}:[`);
          let firstDocument = true;
          const cursor = db.collection<Document>(name).find({});
          for await (const document of cursor) {
            if (!firstDocument) enqueue(",");
            enqueue(JSON.stringify(sanitizeBackupValue(document)));
            firstDocument = false;
          }
          enqueue("]");
        }
        enqueue("}}" );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="agm-bakim-backup-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/backups/export", () => getBackupExport(req), { request: req });
}
