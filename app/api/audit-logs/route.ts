import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { ensureAppIndexes } from "@/lib/dbIndexes";

export const dynamic = "force-dynamic";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canManageUsers(user.role)) return NextResponse.json({ error: "Bu kayıtları görme yetkiniz yok." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(Number.parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(searchParams.get("page_size") || "30", 10) || 30, 1), 100);
  const action = (searchParams.get("action") || "").trim().slice(0, 30);
  const entity = (searchParams.get("entity") || "").trim().slice(0, 60);
  const search = (searchParams.get("q") || "").trim().slice(0, 100);
  const userId = (searchParams.get("user_id") || "").trim().slice(0, 120);
  const logId = (searchParams.get("id") || "").trim().slice(0, 120);
  const from = (searchParams.get("from") || "").trim();
  const to = (searchParams.get("to") || "").trim();
  const includeDetails = searchParams.get("details") === "1";
  const query: Record<string, any> = {};

  if (action) query.action = action;
  if (entity) query.entity = entity;
  if (userId) query.user_id = userId;
  if (logId) query._id = ObjectId.isValid(logId) ? new ObjectId(logId) : logId;
  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: "i" };
    query.$or = [
      { user_name: pattern },
      { user_id: pattern },
      { summary: pattern },
      { entity_id: pattern },
    ];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    query.created_at = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
  }

  await ensureAppIndexes(db);
  const logs = db.collection("audit_logs") as any;
  const projection = includeDetails ? undefined : { before: 0, after: 0 };
  const [items, total] = await Promise.all([
    logs.find(query, projection ? { projection } : undefined)
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    logs.countDocuments(query),
  ]);

  return NextResponse.json({ items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) });
}
