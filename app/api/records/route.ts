import { enginesCollection, maintenanceTypesCollection, recordsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId, type Filter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { recordSchema, formatZodError, type RecordInput } from "@/lib/schemas";
import { writeAuditLog } from "@/lib/audit";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { recomputeLastMaintenance, snapshotTrackingState } from "@/lib/maintenance";
import { withApiTiming } from "@/lib/performance";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, EXTERNAL_SERVICE_TECHNICIAN_NAME, canTechnicianWorkOnType, normalizeTechnicianPermissions, normalizeTechnicianType, resolveTechnicianOptions } from "@/lib/technicians";
import { calculateMaintenanceDurationFromDates, normalizeTechnicianContributionDuration } from "@/lib/maintenanceTime";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { legacyMediaTooLarge, LEGACY_MEDIA_LIMIT_LABEL } from "@/lib/mediaValidation";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";
import type { MaintenanceRecordDocument, MaintenanceTypeDocument } from "@/lib/dbTypes";
import type { MaintenanceTechnicianContribution } from "@/lib/types";
import type { TechnicianOption } from "@/lib/technicians";

export const dynamic = "force-dynamic";

type RecordCursor = { createdAt: string; id: string };

function decodeRecordCursor(value: string | null): RecordCursor | null {
  if (!value || value.length > 500) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<RecordCursor>;
    if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string" || decoded.id.length > 100) return null;
    const date = new Date(decoded.createdAt);
    if (!Number.isFinite(date.getTime()) || !ObjectId.isValid(decoded.id)) return null;
    return { createdAt: date.toISOString(), id: decoded.id };
  } catch {
    return null;
  }
}

function encodeRecordCursor(record: { created_at?: Date | string; _id?: unknown }): string | null {
  if (!record.created_at || !record._id) return null;
  const date = new Date(record.created_at);
  if (!Number.isFinite(date.getTime())) return null;
  return Buffer.from(JSON.stringify({ createdAt: date.toISOString(), id: String(record._id) }), "utf8").toString("base64url");
}

async function getRecords(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureAppIndexes(db);
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const engineId = searchParams.get("engine_id");
    const typeLabel = searchParams.get("type_label");
    const typeKey = searchParams.get("type_key");
    const search = searchParams.get("search")?.trim();
    const confirmationStatus = searchParams.get("confirmation_status");
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("page_size") || "25", 10), 1), 50);
    const includeMedia = searchParams.get("include_media") === "true";
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
    console.error("GET /api/records hatası:", error);
    return NextResponse.json({ error: "Kayıtlar getirilirken bir hata oluştu." }, { status: 500 });
  }
}


async function postRecord(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureAppIndexes(db);
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (user.role === "goruntuleyici") {
      return NextResponse.json({ error: "Görüntüleyici rolü bakım tamamlayamaz." }, { status: 403 });
    }
    const rateLimited = await enforceApiRateLimit(req, "records-create", 120, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const body = await req.json().catch(() => ({}));

    // 🔒 Zod validasyonu: bozuk veri kapıdan geçemez
    const parsed = recordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const {
      client_request_id, engine_id, type_key, type_label, hour_at_completion, note, technician_note,
      photos_b64, photos, videos, pressure_reading, backdated, record_date, period, extra_types,
      other_technician_ids, other_technician_durations, checklist, completion_confirmation, time_tracking_version,
      maintenance_start_at, maintenance_end_at, technician_source, responsible_technician_id, external_service_name,
    } = parsed.data as RecordInput;

    if (legacyMediaTooLarge(photos_b64, videos)) {
      return NextResponse.json({ error: `Eski base64 medya toplamı ${LEGACY_MEDIA_LIMIT_LABEL} sınırını aşamaz. Fotoğraf/video yüklemelerini Blob üzerinden yapın.` }, { status: 413 });
    }

    const enginesCol = enginesCollection(db);
    const typesCol = maintenanceTypesCollection(db);
    const recordsCol = recordsCollection(db);

    if (completion_confirmation === true) {
      const checklistComplete = Array.isArray(checklist) && checklist.length > 0 && checklist.every((entry) => entry.completed === true);
      const hasEvidence = Boolean((technician_note || "").trim() || (photos_b64?.length || photos?.length || videos?.length));
      if (!checklistComplete || !hasEvidence) {
        return NextResponse.json({ error: "Bakım kaydı için kontrol listesi ve en az bir bakım kanıtı gereklidir." }, { status: 400 });
      }
    }

    let maintenanceStartAt: Date | undefined;
    let maintenanceEndAt: Date | undefined;
    let maintenanceDurationMinutes: number | null = null;
    if (time_tracking_version === 2) {
      maintenanceDurationMinutes = calculateMaintenanceDurationFromDates(maintenance_start_at, maintenance_end_at);
      const start = maintenance_start_at ? new Date(maintenance_start_at) : null;
      const end = maintenance_end_at ? new Date(maintenance_end_at) : null;
      if (!maintenanceDurationMinutes || !start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        return NextResponse.json({ error: "Bakım başlangıç ve bitiş tarih-saatleri geçerli olmalı; bitiş başlangıçtan sonra olmalıdır." }, { status: 400 });
      }
      maintenanceStartAt = start;
      maintenanceEndAt = end;
    }

    if (client_request_id) {
      const existing = await recordsCol.findOne({ client_request_id }, { projection: { type_label: 1, group_id: 1 } });
      if (existing) return NextResponse.json({ ok: true, duplicate: true, completed: [existing.type_label], group_id: existing.group_id });
    }

    if (!isSafeMongoPathSegment(engine_id)) return NextResponse.json({ error: "Geçersiz motor kimliği." }, { status: 400 });
    const engine = await enginesCol.findOne({ _id: engine_id });
    if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

    const useExternalService = technician_source === "external_service";
    if (useExternalService && user.role !== "yonetici") {
      return NextResponse.json({ error: "Dış hizmet bakım kaydını yalnızca yöneticiler oluşturabilir." }, { status: 403 });
    }
    if (!useExternalService && responsible_technician_id !== undefined && user.role !== "yonetici") {
      return NextResponse.json({ error: "Sorumlu teknisyeni bakım tamamlama sırasında yalnızca yöneticiler seçebilir." }, { status: 403 });
    }
    if (useExternalService && Array.isArray(other_technician_ids) && other_technician_ids.length > 0) {
      return NextResponse.json({ error: "Dış hizmet kaydında kayıtlı yardımcı teknisyen seçilemez." }, { status: 400 });
    }
    const externalServiceName = typeof external_service_name === "string" ? external_service_name.trim() : "";
    let responsibleTechnicianId = useExternalService ? EXTERNAL_SERVICE_TECHNICIAN_ID : user._id;
    let responsibleTechnicianName = useExternalService
      ? (externalServiceName ? `${EXTERNAL_SERVICE_TECHNICIAN_NAME} · ${externalServiceName}` : EXTERNAL_SERVICE_TECHNICIAN_NAME)
      : user.full_name;
    let responsibleTechnicianType = useExternalService ? undefined : normalizeTechnicianType(user.technician_type);
    let responsibleTechnicianOption: TechnicianOption | null = useExternalService ? null : { id: user._id, full_name: user.full_name, technician_type: responsibleTechnicianType || normalizeTechnicianType(user.technician_type), ...normalizeTechnicianPermissions(user, responsibleTechnicianType || normalizeTechnicianType(user.technician_type)) };
    if (!useExternalService && typeof responsible_technician_id === "string") {
      const resolvedResponsible = await resolveTechnicianOptions(db, [responsible_technician_id]);
      if (!resolvedResponsible || resolvedResponsible.length !== 1) {
        return NextResponse.json({ error: "Seçilen sorumlu teknisyen aktif veya onaylı değil." }, { status: 400 });
      }
      responsibleTechnicianId = resolvedResponsible[0].id;
      responsibleTechnicianName = resolvedResponsible[0].full_name;
      responsibleTechnicianType = resolvedResponsible[0].technician_type;
      responsibleTechnicianOption = resolvedResponsible[0];
    }
    const requestedTypeKeys = [...new Set([type_key, ...(extra_types || []).map((item) => item.type_key)])];
    const maintenanceTypes = await typesCol.find({ _id: { $in: requestedTypeKeys }, is_deleted: { $ne: true } }, { projection: { _id: 1, label: 1, work_domains: 1, allow_electromechanical_support: 1, allow_electromechanical_responsible: 1, engine_states: 1 } }).toArray();
    const maintenanceTypeByKey = new Map<string, MaintenanceTypeDocument>(maintenanceTypes.map((item) => [String(item._id), item]));
    const missingType = requestedTypeKeys.find((key) => !maintenanceTypeByKey.has(key));
    if (missingType) return NextResponse.json({ error: "Seçilen bakım türü bulunamadı." }, { status: 404 });
    const selectedTypes = requestedTypeKeys.map((key) => maintenanceTypeByKey.get(key)).filter((type): type is MaintenanceTypeDocument => type !== undefined);
    if (!useExternalService) {
      const validationRole = user.role === "yonetici" || typeof responsible_technician_id === "string" ? "responsible" : "support";
      if (!selectedTypes.every((type) => canTechnicianWorkOnType(responsibleTechnicianOption, type, validationRole))) {
        return NextResponse.json({ error: "Seçilen teknisyen, bu bakım türlerinden en az biri için yetkili değil." }, { status: 403 });
      }
    }
    const resolvedOtherTechnicians = useExternalService ? [] : await resolveTechnicianOptions(db, other_technician_ids);
    if (!resolvedOtherTechnicians || resolvedOtherTechnicians.some((technician) => technician.id === responsibleTechnicianId)) {
      return NextResponse.json({ error: "Sorumlu teknisyen yardımcı listesine eklenemez veya seçilen teknisyen geçersiz." }, { status: 400 });
    }
    if (!useExternalService && resolvedOtherTechnicians.some((technician) => !selectedTypes.every((type) => canTechnicianWorkOnType(technician, type, "support")))) {
      return NextResponse.json({ error: "Seçilen yardımcı teknisyenlerden biri bu bakım türü için yetkili değil." }, { status: 403 });
    }
    const otherTechnicians = resolvedOtherTechnicians.map(({ id, full_name, technician_type }) => ({ id, full_name, technician_type }));
    const technicianContributions: MaintenanceTechnicianContribution[] = useExternalService ? [] : [
      { id: responsibleTechnicianId, full_name: responsibleTechnicianName, technician_type: responsibleTechnicianType, contribution_role: "responsible" as const, duration_minutes: maintenanceDurationMinutes || 0 },
      ...otherTechnicians.map((technician) => ({
        ...technician,
        contribution_role: "support" as const,
        duration_minutes: normalizeTechnicianContributionDuration(other_technician_durations?.[technician.id], maintenanceDurationMinutes ?? 0),
      })),
    ];
    const primaryType = await typesCol.findOne({ _id: type_key }, { projection: { engine_states: 1 } });
    const primaryPreviousTrackingState = snapshotTrackingState(primaryType?.engine_states?.[engine_id]);
    const primaryTrackingAutoCreated = typeof period === "number" && (!primaryType?.engine_states?.[engine_id] || primaryType.engine_states[engine_id]?.tracking_source === "record");
    const shouldConfirmOnCreate = user.role === "yonetici";
    const managerConfirmationStatus = shouldConfirmOnCreate ? "confirmed" : "pending";
    const managerConfirmedAt = shouldConfirmOnCreate ? new Date() : undefined;

    const createdAt = backdated && record_date ? new Date(record_date) : new Date();
    const groupId = new ObjectId().toString();
    const normalizedChecklist = Array.isArray(checklist)
      ? checklist
        .map((item) => ({ label: typeof item.label === "string" ? item.label.trim() : "", completed: item.completed === true }))
        .filter((item): item is { label: string; completed: boolean } => item.label.length > 0)
      : [];

    async function insertOneRecord(tKey: string, tLabel: string, isPrimary: boolean, trackingAutoCreated = false, previousTrackingState?: unknown) {
      const rec: MaintenanceRecordDocument = {
        engine_id, engine_name: engine.name, type_key: tKey, type_label: tLabel,
        hour_at_completion,
        ...(maintenanceStartAt && maintenanceEndAt && maintenanceDurationMinutes ? {
          time_tracking_version: 2,
          maintenance_start_at: maintenanceStartAt,
          maintenance_end_at: maintenanceEndAt,
          maintenance_duration_minutes: maintenanceDurationMinutes,
        } : {}),
        note: isPrimary ? (note || "") : "",
        technician_note: isPrimary ? (technician_note || "") : "",
        photos_b64: isPrimary ? (photos_b64 || []) : [],
        photos: isPrimary ? (photos || []) : [],
        videos: isPrimary ? (videos || []) : [],
        checklist: isPrimary ? normalizedChecklist : [],
        ...(isPrimary && completion_confirmation === true ? { completion_confirmed_at: new Date() } : {}),
        manager_confirmation_status: managerConfirmationStatus,
        ...(shouldConfirmOnCreate && managerConfirmedAt ? {
          manager_confirmed_at: managerConfirmedAt,
          manager_confirmed_by_id: user._id,
          manager_confirmed_by_name: user.full_name,
          manager_confirmed_by_role: user.role,
        } : {}),
        technician_id: responsibleTechnicianId,
        technician_name: responsibleTechnicianName,
        ...(responsibleTechnicianType ? { technician_type: responsibleTechnicianType } : {}),
        technician_source: useExternalService ? "external_service" : "internal",
        ...(useExternalService && externalServiceName ? { external_service_name: externalServiceName } : {}),
        other_technician_ids: otherTechnicians.map((technician) => technician.id),
        other_technicians: otherTechnicians,
        technician_contributions: technicianContributions,
        client_request_id: client_request_id || undefined,
        created_at: createdAt, backdated: !!backdated,
        group_id: groupId, grouped_with: isPrimary ? null : tLabel,
        ...(trackingAutoCreated ? { auto_created_tracking: true } : {}),
        ...(previousTrackingState ? { tracking_state_before: previousTrackingState } : {}),
      };
      if (isPrimary && typeof pressure_reading === "number") rec.pressure_reading = pressure_reading;
      await recordsCol.insertOne(rec);
      await recomputeLastMaintenance(db, engine_id, tKey);
    }

    if (typeof period === "number") {
      await typesCol.updateOne(
        { _id: type_key },
        { $set: { [`engine_states.${engine_id}.period_hours`]: period, [`engine_states.${engine_id}.tracking_source`]: primaryTrackingAutoCreated ? "record" : "manual", engine_scope: primaryType?.engine_scope === "all" ? "all" : "explicit" } },
        { upsert: true }
      );
    }
    await insertOneRecord(type_key, type_label, true, primaryTrackingAutoCreated, primaryPreviousTrackingState);

    const completedLabels: string[] = [type_label];
    if (Array.isArray(extra_types)) {
      for (const ex of extra_types) {
        const extraType = await typesCol.findOne({ _id: ex.type_key }, { projection: { engine_states: 1 } });
        const extraPreviousTrackingState = snapshotTrackingState(extraType?.engine_states?.[engine_id]);
        const extraTrackingAutoCreated = typeof ex.period === "number" && (!extraType?.engine_states?.[engine_id] || extraType.engine_states[engine_id]?.tracking_source === "record");
        if (typeof ex.period === "number") {
          await typesCol.updateOne(
            { _id: ex.type_key },
            { $set: { [`engine_states.${engine_id}.period_hours`]: ex.period, [`engine_states.${engine_id}.tracking_source`]: extraTrackingAutoCreated ? "record" : "manual", engine_scope: extraType?.engine_scope === "all" ? "all" : "explicit" } },
            { upsert: true }
          );
        }
        await insertOneRecord(ex.type_key, ex.type_label, false, extraTrackingAutoCreated, extraPreviousTrackingState);
        completedLabels.push(ex.type_label);
      }
    }

    if (hour_at_completion > engine.hours) {
      const stamp = new Date();
      await enginesCol.updateOne(
        { _id: engine_id },
        {
          $set: { hours: hour_at_completion, updated_at: stamp },
          $push: { history: { date: stamp.toISOString(), hours: hour_at_completion, load_kw: engine.load_kw || 0 } },
        }
      );
    }

    await writeAuditLog(db, {
      user,
      action: "create",
      entity: "maintenance_record",
      entityId: groupId,
      summary: `${engine.name} için ${completedLabels.join(", ")} bakımı oluşturuldu${shouldConfirmOnCreate ? " ve yönetici tarafından teyit edildi" : "; yönetici teyidi bekleniyor"}`,
      after: { engine_id, type_key, type_label, hour_at_completion, completedLabels, technician_id: responsibleTechnicianId, technician_name: responsibleTechnicianName, technician_source: useExternalService ? "external_service" : "internal", external_service_name: externalServiceName || undefined, other_technician_ids: otherTechnicians.map((technician) => technician.id), completion_confirmation: completion_confirmation === true, manager_confirmation_status: managerConfirmationStatus, manager_confirmed: shouldConfirmOnCreate, confirmation_required: !shouldConfirmOnCreate, maintenance_start_at: maintenanceStartAt, maintenance_end_at: maintenanceEndAt, maintenance_duration_minutes: maintenanceDurationMinutes },
    });
    invalidateMaintenancePanelServerCache();
    return NextResponse.json({ ok: true, completed: completedLabels, confirmed: shouldConfirmOnCreate, confirmation_required: !shouldConfirmOnCreate });
  } catch (error) {
    console.error("POST /api/records hatası:", error);
    return NextResponse.json({ error: "Bakım kaydı oluşturulurken bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/records", () => getRecords(req), { request: req });
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/records", () => postRecord(req), { request: req });
}
