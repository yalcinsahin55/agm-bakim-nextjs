import { equipmentInfoCollection, usersCollection } from "@/lib/dbCollections";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { MAX_SMALL_JSON_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const rateLimited = await enforceApiRateLimit(req, "equipment-info-list", 120, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;
    const items = await equipmentInfoCollection(db).find({}, {
      projection: { _id: 1, stable_id: 1, engine_name: 1, kaver_tipi: 1, hava_filtresi: 1, krankcase: 1, esanjor_tipi: 1, dungs: 1, radyator_tipi: 1, not: 1 },
    }).toArray();
    return NextResponse.json(items);
  } catch (error) {
    console.error("equipment-info GET hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Veriler yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
    }
    const rateLimited = await enforceApiRateLimit(req, "equipment-info-create", 60, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const bodyResult = await parseJsonBodyLimited(req, MAX_SMALL_JSON_REQUEST_BYTES);
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.tooLarge ? "Motor bilgi kartı isteği izin verilen boyutu aşıyor." : "Geçersiz motor bilgi kartı verisi." },
        { status: bodyResult.tooLarge ? 413 : 400 },
      );
    }
    const body = bodyResult.value;
    const { engine_name, kaver_tipi, hava_filtresi, krankcase, esanjor_tipi, dungs, radyator_tipi, not: noteField } =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
    const name = typeof engine_name === "string" ? engine_name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Motor adı gerekli." }, { status: 400 });
    }
    const optionalText = (value: unknown): string | null => typeof value === "string" ? value.trim() || null : null;

    const col = equipmentInfoCollection(db);
    const existing = await col.findOne({ _id: name });
    if (existing) {
      return NextResponse.json({ error: "Bu motor için zaten bir bilgi kartı var. Listeden düzenleyebilirsiniz." }, { status: 409 });
    }

    const doc = {
      _id: name, stable_id: randomUUID(), engine_name: name,
      kaver_tipi: optionalText(kaver_tipi), hava_filtresi: optionalText(hava_filtresi), krankcase: optionalText(krankcase),
      esanjor_tipi: optionalText(esanjor_tipi), dungs: optionalText(dungs), radyator_tipi: optionalText(radyator_tipi),
      not: optionalText(noteField),
    };
    await col.insertOne(doc);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("equipment-info POST hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Motor bilgi kartı eklenirken bir hata oluştu." }, { status: 500 });
  }
}
