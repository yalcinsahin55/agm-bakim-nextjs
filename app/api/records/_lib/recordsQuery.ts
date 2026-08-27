import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId, type Filter } from "mongodb";
import { recordsCollection, usersCollection } from "@/lib/dbCollections";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";
import { decodeRecordCursor, encodeRecordCursor } from "./recordRouteHelpers";

export async function getRecords(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    const readRateLimited = await enforceApiRateLimit(req, "records-read", 240, 10 * 60 * 1000, user._id);
    if (readRateLimited) return readRateLimited;
    await ensureAppIndexes(db);

    const { searchParams } = new URL(req.url);
    const engineId = searchParams.get("engine_id");
    const typeLabel = searchParams.get("type_label");
    const typeKey = searchParams.get("type_key");
    const search = searchParams.get("search")?.trim();
    const confirmationStatus = searchParams.get("confirmation_status");
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("page_size") || "25", 10), 1), 50);
    const includeMedia = searchParams.get("include_media") === "true";
    if (includeMedia) {
      return NextResponse.json({ error: "Liste endpointinde medya gönderilmez; medya için /api/records/{id}?include_media=true kullanın." }, { status: 400 });
    }
    const sortDirection = searchParams.get("sort") === "asc" ? 1 : -1;
    const sortSpec = { maintenance_start_at: sortDirection, created_at: sortDirection, _id: sortDirection } as const;
    const legacyLimit = searchParams.get("limit");
    const cursor = decodeRecordCursor(searchParams.get("cursor"));
    const cursorRequest = Boolean(cursor);
    const legacyRequest = Boolean(legacyLimit && !searchParams.has("page") && !searchParams.has("page_size") && !cursorRequest);

    const query: Filter<MaintenanceRecordDocument> = {};
    if (engineId) query.engine_id = engineId;
    if (typeLabel) query.type_label = typeLabel;
    if (typeKey) query.type_key = typeKey;
    if (confirmationStatus === "pending" || confirmationStatus === "confirmed") {
      query.manager_confirmation_status = confirmationStatus;
    }
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
      query.$or = [
        { engine_name: { $regex: escaped, $options: "i" } },
        { type_label: { $regex: escaped, $options: "i" } },
        { technician_name: { $regex: escaped, $options: "i" } },
      ];
    }

    const recordsCol = recordsCollection(db);
    if (cursorRequest && cursor) {
      const cursorDate = new Date(cursor.createdAt);
      const cursorId = new ObjectId(cursor.id);
      const direction = sortDirection === 1 ? "$gt" : "$lt";
      const cursorQuery = {
        $and: [
          query,
          { $or: [{ created_at: { [direction]: cursorDate } }, { created_at: cursorDate, _id: { [direction]: cursorId } }] },
        ],
      };
      const cursorRows = await recordsCol.find(cursorQuery, { projection: includeMedia ? undefined : { photos_b64: 0, videos: 0 } })
        .sort({ created_at: sortDirection, _id: sortDirection })
        .limit(pageSize + 1)
        .toArray();
      const hasNextPage = cursorRows.length > pageSize;
      const records = hasNextPage ? cursorRows.slice(0, pageSize) : cursorRows;
      return NextResponse.json({ records, pageSize, pagination: "cursor", hasNextPage, nextCursor: hasNextPage ? encodeRecordCursor(records[records.length - 1]) : null });
    }

    if (legacyRequest) {
      const records = await recordsCol.find(query, { projection: includeMedia ? undefined : { photos_b64: 0, videos: 0 } })
        .sort(sortSpec)
        .limit(Math.min(Math.max(parseInt(legacyLimit || "500", 10), 1), 1000))
        .toArray();
      return NextResponse.json(records);
    }

    const [records, total] = await Promise.all([
      recordsCol.find(query, { projection: includeMedia ? undefined : { photos_b64: 0, videos: 0 } })
        .sort(sortSpec)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      recordsCol.countDocuments(query),
    ]);

    return NextResponse.json({
      records,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    console.error("GET /api/records hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Kayıtlar getirilirken bir hata oluştu." }, { status: 500 });
  }
}
