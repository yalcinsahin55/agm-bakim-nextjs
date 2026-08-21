import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { ensureAuditIndexes } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canManageUsers(user.role)) return NextResponse.json({ error: "Bu kayıtları görme yetkiniz yok." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
  const pageSize = Math.min(Math.max(parseInt(searchParams.get("page_size") || "30", 10), 1), 100);
  const action = searchParams.get("action");
  const entity = searchParams.get("entity");
  const query: Record<string, string> = {};
  if (action) query.action = action;
  if (entity) query.entity = entity;

  await ensureAuditIndexes(db);
  const logs = db.collection("audit_logs") as any;
  const [items, total] = await Promise.all([
    logs.find(query, { projection: { before: 0, after: 0 } })
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    logs.countDocuments(query),
  ]);

  return NextResponse.json({ items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) });
}
