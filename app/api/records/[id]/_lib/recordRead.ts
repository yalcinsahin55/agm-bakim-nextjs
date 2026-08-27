import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordsCollection, usersCollection } from "@/lib/dbCollections";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { parseRecordId, type RecordRouteContext } from "./recordDetailHelpers";

export async function getRecord(req: NextRequest, { params }: RecordRouteContext) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  await ensureAppIndexes(db);

  const recordId = parseRecordId(id);
  if (!recordId) return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const includeMedia = req.nextUrl.searchParams.get("include_media") === "true";
  const record = await recordsCollection(db).findOne(
    { _id: recordId },
    includeMedia ? undefined : { projection: { photos_b64: 0, videos: 0 } },
  );
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (req.nextUrl.searchParams.get("include_group") === "true" && record.group_id) {
    const groupTypes = await recordsCollection(db).find(
      { group_id: record.group_id },
      { projection: { type_key: 1, type_label: 1 }, limit: 50 },
    ).toArray();
    return NextResponse.json({
      ...record,
      group_types: groupTypes
        .filter((item) => typeof item.type_key === "string" && typeof item.type_label === "string")
        .map((item) => ({ type_key: item.type_key, type_label: item.type_label })),
    });
  }
  return NextResponse.json(record);
}
