import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ALLOWED_COLLECTIONS = ["engines", "maintenance_types", "maintenance_records", "oil_analyses"] as const;
const BLOCKED_KEYS = new Set(["password", "password_hash", "token", "VAPID_PRIVATE_KEY", "pdf_b64", "photos_b64", "data_b64"]);

type AllowedCollection = typeof ALLOWED_COLLECTIONS[number];

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!BLOCKED_KEYS.has(key)) result[key] = clean(item);
  }
  return result;
}

function getIdentity(document: Record<string, unknown>): string | null {
  const id = document._id;
  if (typeof id === "string" && id.length > 0) return id;
  if (id && typeof id === "object" && "$oid" in id && typeof (id as { $oid?: unknown }).$oid === "string") return (id as { $oid: string }).$oid;
  return null;
}

export async function POST(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canManageUsers(user.role)) return NextResponse.json({ error: "Geri yükleme yetkiniz yok." }, { status: 403 });

  try {
    const body = await req.json();
    if (body?.confirm !== "RESTORE") return NextResponse.json({ error: "Geri yüklemeyi onaylamak için RESTORE yazılmalıdır." }, { status: 400 });
    const collections = body?.collections;
    if (!collections || typeof collections !== "object") return NextResponse.json({ error: "Geçersiz yedek dosyası." }, { status: 400 });

    const summary: Record<string, number> = {};
    for (const name of ALLOWED_COLLECTIONS) {
      const documents = Array.isArray(collections[name]) ? collections[name] : [];
      if (documents.length > 50000) return NextResponse.json({ error: `${name} koleksiyonu çok büyük.` }, { status: 413 });
      let count = 0;
      for (const raw of documents) {
        if (!raw || typeof raw !== "object") continue;
        const document = clean(raw) as Record<string, unknown>;
        const identity = getIdentity(document);
        if (identity) {
          delete document._id;
          await (db.collection(name) as any).updateOne(
            { _id: identity },
            { $set: document, $setOnInsert: { _id: identity } },
            { upsert: true },
          );
        } else {
          delete document._id;
          await (db.collection(name) as any).insertOne(document);
        }
        count += 1;
      }
      summary[name] = count;
    }

    await writeAuditLog(db, {
      user,
      action: "update",
      entity: "database",
      summary: "Sanitized uygulama yedeği geri yüklendi",
      after: { summary, restoredAt: new Date().toISOString(), mode: "merge" },
    });
    return NextResponse.json({ ok: true, summary, mode: "merge" });
  } catch (error) {
    console.error("POST /api/backups/restore hatası:", error);
    return NextResponse.json({ error: "Yedek geri yüklenemedi. Dosya biçimini kontrol edin." }, { status: 400 });
  }
}
