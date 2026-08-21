import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

function sanitizeDocument(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeDocument);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (["password", "password_hash", "token", "VAPID_PRIVATE_KEY"].includes(key)) continue;
    if (["pdf_b64", "photos_b64", "data_b64"].includes(key)) continue;
    result[key] = sanitizeDocument(item);
  }
  return result;
}

export async function GET(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canManageUsers(user.role)) return NextResponse.json({ error: "Yedek alma yetkiniz yok." }, { status: 403 });

  const names = ["users", "engines", "maintenance_types", "maintenance_records", "oil_analyses", "notifications", "audit_logs"];
  const collections: Record<string, any[]> = {};
  for (const name of names) {
    const docs = await (db.collection(name) as any).find({}).toArray();
    collections[name] = docs.map(sanitizeDocument);
  }

  const exportedAt = new Date().toISOString();
  await writeAuditLog(db, { user, action: "export", entity: "database", summary: "Uygulama veritabanı dışa aktarıldı", after: { collections: names, exportedAt } });
  const body = JSON.stringify({ version: 1, exportedAt, database: db.databaseName, collections }, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="agm-bakim-backup-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
