import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { recomputeLastMaintenance } from "@/lib/maintenance";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, EXTERNAL_SERVICE_TECHNICIAN_NAME, canTechnicianWorkOnType, normalizeTechnicianPermissions, normalizeTechnicianType, resolveTechnicianOptions } from "@/lib/technicians";
import { calculateMaintenanceDurationFromDates, normalizeTechnicianContributionDuration } from "@/lib/maintenanceTime";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { legacyMediaTooLarge, LEGACY_MEDIA_LIMIT_LABEL } from "@/lib/mediaValidation";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";

export const dynamic = "force-dynamic";

function parseRecordId(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function canModify(user: any, record: any): boolean {
  return canWriteMaintenance(user.role) && (user.role === "yonetici" || record.technician_id === user._id);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  await ensureAppIndexes(db);
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const recordId = parseRecordId(id);
  if (!recordId) return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const includeMedia = req.nextUrl.searchParams.get("include_media") === "true";
  const record = await (db.collection("maintenance_records") as any).findOne(
    { _id: recordId },
    includeMedia ? undefined : { projection: { photos_b64: 0, videos: 0 } },
  );
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  await ensureAppIndexes(db);
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(req, "records-update", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const recordId = parseRecordId(id);
  if (!recordId) return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const recordsCol = db.collection("maintenance_records") as any;
  const record = await recordsCol.findOne({ _id: recordId });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (!canModify(user, record)) return NextResponse.json({ error: "Bu kaydı düzenleme yetkiniz yok." }, { status: 403 });

  const body = await req.json();
  const clientRequestId = typeof body?.client_request_id === "string" && body.client_request_id.length >= 8 && body.client_request_id.length <= 100
    ? body.client_request_id
    : undefined;
  const { hour_at_completion, note, technician_note, photos_b64, photos, videos, pressure_reading, extra_types, other_technician_ids, other_technician_durations, responsible_technician_id, technician_source, external_service_name, time_tracking_version, maintenance_start_at, maintenance_end_at } = body;

  if (legacyMediaTooLarge(photos_b64, videos)) {
    return NextResponse.json({ error: `Eski base64 medya toplamı ${LEGACY_MEDIA_LIMIT_LABEL} sınırını aşamaz. Fotoğraf/video yüklemelerini Blob üzerinden yapın.` }, { status: 413 });
  }

  const update: Record<string, any> = {};
  let nextStartAt: Date | undefined = record.maintenance_start_at ? new Date(record.maintenance_start_at) : undefined;
  let nextEndAt: Date | undefined = record.maintenance_end_at ? new Date(record.maintenance_end_at) : undefined;
  let nextDurationMinutes: number | null = typeof record.maintenance_duration_minutes === "number" ? record.maintenance_duration_minutes : calculateMaintenanceDurationFromDates(nextStartAt, nextEndAt);
  if (time_tracking_version === 2) {
    const duration = calculateMaintenanceDurationFromDates(maintenance_start_at, maintenance_end_at);
    const start = maintenance_start_at ? new Date(maintenance_start_at) : null;
    const end = maintenance_end_at ? new Date(maintenance_end_at) : null;
    if (!duration || !start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      return NextResponse.json({ error: "Bakım başlangıç ve bitiş tarih-saatlerini geçerli şekilde girin; bitiş başlangıçtan sonra olmalıdır." }, { status: 400 });
    }
    nextStartAt = start;
    nextEndAt = end;
    nextDurationMinutes = duration;
    update.time_tracking_version = 2;
    update.maintenance_start_at = start;
    update.maintenance_end_at = end;
    update.maintenance_duration_minutes = duration;
  }
  const requestedSource = technician_source === "external_service" || technician_source === "internal" ? technician_source : undefined;
  const useExternalService = requestedSource === "external_service" || (requestedSource === undefined && (record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID));
  if (useExternalService && user.role !== "yonetici") {
    return NextResponse.json({ error: "Dış hizmet bakım kaydını yalnızca yöneticiler düzenleyebilir." }, { status: 403 });
  }
  const externalServiceName = typeof external_service_name === "string" ? external_service_name.trim() : (record.external_service_name || "");
  const groupedTypeKeys = record.group_id ? (await recordsCol.find({ group_id: record.group_id }, { projection: { type_key: 1 } }).toArray()).map((item: any) => item.type_key) : [];
  const historicalTypeKeys = [...new Set([record.type_key, ...groupedTypeKeys])];
  const historicalTypeKeySet = new Set(historicalTypeKeys);
  const requestedExtraTypeKeys = Array.isArray(extra_types)
    ? extra_types.map((item: any) => item?.type_key).filter((key: unknown): key is string => typeof key === "string" && key.length > 0)
    : [];
  const selectedTypeKeys = [...new Set([...historicalTypeKeys, ...requestedExtraTypeKeys])];
  const allSelectedTypeDocs = await (db.collection("maintenance_types") as any).find(
    { _id: { $in: selectedTypeKeys } },
    { projection: { _id: 1, label: 1, is_deleted: 1, work_domains: 1, allow_electromechanical_support: 1, allow_electromechanical_responsible: 1 } },
  ).toArray();
  // Geçmiş kaydın mevcut türü artık arşivlenmiş olsa bile temel düzenlemeler engellenmez.
  // Ancak yeni eklenmek istenen türler mutlaka aktif olmalıdır.
  const selectedTypeDocs = allSelectedTypeDocs.filter((type: any) => type.is_deleted !== true || historicalTypeKeySet.has(String(type._id)));
  if (selectedTypeDocs.length !== selectedTypeKeys.length) return NextResponse.json({ error: "Seçilen bakım türlerinden biri bulunamadı veya artık aktif değil." }, { status: 404 });
  let nextResponsibleId = useExternalService ? EXTERNAL_SERVICE_TECHNICIAN_ID : record.technician_id;
  let nextResponsibleName = useExternalService
    ? (externalServiceName ? `${EXTERNAL_SERVICE_TECHNICIAN_NAME} · ${externalServiceName}` : EXTERNAL_SERVICE_TECHNICIAN_NAME)
    : record.technician_name;
  let nextResponsibleType = useExternalService ? undefined : normalizeTechnicianType(record.technician_type);
  let nextResponsibleOption: any = null;
  let effectiveOtherTechnicians: Array<{ id: string; full_name: string; technician_type: "mekanik" | "elektromekanik" }> = [];
  if (useExternalService) {
    if (Array.isArray(other_technician_ids) && other_technician_ids.length > 0) {
      return NextResponse.json({ error: "Dış hizmet kaydında kayıtlı yardımcı teknisyen seçilemez." }, { status: 400 });
    }
    update.technician_id = nextResponsibleId;
    update.technician_name = nextResponsibleName;
    update.technician_source = "external_service";
    update.$unset = { technician_type: "" };
    if (externalServiceName) update.external_service_name = externalServiceName;
    else update.$unset.external_service_name = "";
    update.other_technician_ids = [];
    update.other_technicians = [];
  } else {
    if (record.technician_source === "external_service" && typeof responsible_technician_id !== "string") {
      return NextResponse.json({ error: "Dış hizmet kaydını kayıtlı teknisyene çevirmek için sorumlu teknisyen seçin." }, { status: 400 });
    }
    if (typeof responsible_technician_id === "string" && responsible_technician_id !== record.technician_id) {
      if (user.role !== "yonetici") {
        return NextResponse.json({ error: "Sorumlu teknisyeni yalnızca yöneticiler değiştirebilir." }, { status: 403 });
      }
      const resolvedResponsible = await resolveTechnicianOptions(db, [responsible_technician_id]);
      if (!resolvedResponsible || resolvedResponsible.length !== 1) {
        return NextResponse.json({ error: "Seçilen sorumlu teknisyen aktif veya onaylı değil." }, { status: 400 });
      }
      nextResponsibleId = resolvedResponsible[0].id;
      nextResponsibleName = resolvedResponsible[0].full_name;
      nextResponsibleType = resolvedResponsible[0].technician_type;
      nextResponsibleOption = resolvedResponsible[0];
      update.technician_id = nextResponsibleId;
      update.technician_name = nextResponsibleName;
    }
    update.technician_source = "internal";
    update.technician_type = nextResponsibleType;
    update.$unset = { external_service_name: "" };

    effectiveOtherTechnicians = Array.isArray(record.other_technicians)
      ? record.other_technicians.filter((technician: any) => technician && typeof technician.id === "string" && typeof technician.full_name === "string")
      : [];
    if (Array.isArray(other_technician_ids)) {
      const resolvedOtherTechnicians = await resolveTechnicianOptions(db, other_technician_ids);
      if (!resolvedOtherTechnicians || resolvedOtherTechnicians.some((technician) => technician.id === nextResponsibleId)) {
        return NextResponse.json({ error: "Sorumlu teknisyen yardımcı listesine eklenemez veya seçilen teknisyen geçersiz." }, { status: 400 });
      }
      const existingSupportIds = new Set((record.other_technician_ids || []).map((id: unknown) => String(id)));
      if (resolvedOtherTechnicians.some((technician) => !existingSupportIds.has(technician.id) && !selectedTypeDocs.every((type: any) => canTechnicianWorkOnType(technician, type, "support")))) {
        return NextResponse.json({ error: "Seçilen yardımcı teknisyenlerden biri bu bakım türü için yetkili değil." }, { status: 403 });
      }
      effectiveOtherTechnicians = resolvedOtherTechnicians.map(({ id, full_name, technician_type }) => ({ id, full_name, technician_type }));
      update.other_technician_ids = effectiveOtherTechnicians.map((technician) => technician.id);
      update.other_technicians = effectiveOtherTechnicians;
    } else if (nextResponsibleId !== record.technician_id && effectiveOtherTechnicians.some((technician) => technician.id === nextResponsibleId)) {
      return NextResponse.json({ error: "Yeni sorumlu teknisyen yardımcı listesinde bulunamaz." }, { status: 400 });
    }
  }
  const isExistingOwnerUpdate = user.role !== "yonetici" && record.technician_id === user._id && responsible_technician_id === undefined && !(Array.isArray(extra_types) && extra_types.length > 0);
  const responsibleSelectionChanged = typeof responsible_technician_id === "string" && responsible_technician_id !== record.technician_id;
  if (!useExternalService && !isExistingOwnerUpdate && (user.role !== "yonetici" || responsibleSelectionChanged || (Array.isArray(extra_types) && extra_types.length > 0))) {
    if (!nextResponsibleOption && nextResponsibleId === user._id) {
      nextResponsibleOption = { id: user._id, full_name: user.full_name, technician_type: nextResponsibleType, ...normalizeTechnicianPermissions(user as any, nextResponsibleType) };
    }
    if (!nextResponsibleOption) {
      const resolvedCurrentResponsible = await resolveTechnicianOptions(db, [nextResponsibleId]);
      nextResponsibleOption = resolvedCurrentResponsible?.[0] || { id: nextResponsibleId, full_name: nextResponsibleName, technician_type: nextResponsibleType, ...normalizeTechnicianPermissions({}, nextResponsibleType) };
    }
    if (!selectedTypeDocs.every((type: any) => canTechnicianWorkOnType(nextResponsibleOption, type, "responsible"))) {
      return NextResponse.json({ error: "Seçilen sorumlu teknisyen, bu bakım türlerinden en az biri için yetkili değil." }, { status: 403 });
    }
  }
  const technicianContributions = useExternalService ? [] : [
    { id: nextResponsibleId, full_name: nextResponsibleName, technician_type: nextResponsibleType, contribution_role: "responsible", duration_minutes: nextDurationMinutes || 0 },
    ...effectiveOtherTechnicians.map((technician) => ({
      ...technician,
      contribution_role: "support",
      duration_minutes: normalizeTechnicianContributionDuration(other_technician_durations?.[technician.id], nextDurationMinutes ?? 0),
    })),
  ];
  update.technician_contributions = technicianContributions;
  if (typeof hour_at_completion === "number") update.hour_at_completion = hour_at_completion;
  if (typeof note === "string") update.note = note;
  if (typeof technician_note === "string") update.technician_note = technician_note;
  if (Array.isArray(photos_b64)) update.photos_b64 = photos_b64;
  if (Array.isArray(photos)) update.photos = photos;
  if (Array.isArray(videos)) update.videos = videos;
  if (typeof pressure_reading === "number") update.pressure_reading = pressure_reading;

  const unset = update.$unset;
  delete update.$unset;
  await recordsCol.updateOne({ _id: record._id }, { $set: update, ...(unset ? { $unset: unset } : {}) });
  await writeAuditLog(db, {
    user,
    action: "update",
    entity: "maintenance_record",
    entityId: id,
    summary: `${record.engine_name} · ${record.type_label} bakım kaydı güncellendi`,
    before: record,
    after: update,
  });

  if (typeof hour_at_completion === "number" && hour_at_completion !== record.hour_at_completion) {
    await recomputeLastMaintenance(db, record.engine_id, record.type_key);

    const enginesCol = db.collection("engines") as any;
    const engine = await enginesCol.findOne({ _id: record.engine_id });
    if (engine && hour_at_completion > engine.hours) {
      const stamp = new Date();
      await enginesCol.updateOne(
        { _id: record.engine_id },
        {
          $set: { hours: hour_at_completion, updated_at: stamp },
          $push: { history: { date: stamp.toISOString(), hours: hour_at_completion, load_kw: engine.load_kw || 0 } },
        }
      );
    }
  }

  // Bu kaydı düzenlerken birlikte tamamlanan ama daha önce hiç kaydedilmemiş başka bakımlar da ekleniyorsa,
  // her biri için ayrı kayıt oluşturulur ve aynı gruba bağlanır.
  if (Array.isArray(extra_types) && extra_types.length > 0) {
    let groupId = record.group_id;
    if (!groupId) {
      groupId = new ObjectId().toString();
      await recordsCol.updateOne({ _id: record._id }, { $set: { group_id: groupId } });
    }
    const finalHour = typeof hour_at_completion === "number" ? hour_at_completion : record.hour_at_completion;
    const extraTechnicianContributions = useExternalService ? [] : [
      { id: nextResponsibleId, full_name: nextResponsibleName, technician_type: nextResponsibleType, contribution_role: "responsible", duration_minutes: nextDurationMinutes || 0 },
      ...effectiveOtherTechnicians.map((technician) => ({ ...technician, contribution_role: "support", duration_minutes: normalizeTechnicianContributionDuration(other_technician_durations?.[technician.id], nextDurationMinutes ?? 0) })),
    ];
    const extraManagerConfirmationStatus = record.manager_confirmation_status || (user.role === "yonetici" ? "confirmed" : "pending");
    const extraManagerConfirmedAt = extraManagerConfirmationStatus === "confirmed" ? new Date() : undefined;
    const typesCol = db.collection("maintenance_types") as any;

    for (const ex of extra_types) {
      const extraClientRequestId = `${clientRequestId || `record:${String(record._id)}`}:extra:${String(ex.type_key)}`;
      const existingExtra = await recordsCol.findOne(
        {
          $or: [
            { group_id: groupId, type_key: ex.type_key },
            ...(extraClientRequestId ? [{ client_request_id: extraClientRequestId }] : []),
          ],
        },
        { projection: { _id: 1 } },
      );
      if (existingExtra) continue;
      if (typeof ex.period === "number" && isSafeMongoPathSegment(record.engine_id)) {
        await typesCol.updateOne(
          { _id: ex.type_key },
          { $set: { [`engine_states.${record.engine_id}.period_hours`]: ex.period } },
          { upsert: true }
        );
      }
      await recordsCol.insertOne({
        engine_id: record.engine_id, engine_name: record.engine_name,
        type_key: ex.type_key, type_label: ex.type_label,
        hour_at_completion: finalHour,
        ...(nextStartAt && nextEndAt && nextDurationMinutes ? {
          time_tracking_version: 2,
          maintenance_start_at: nextStartAt,
          maintenance_end_at: nextEndAt,
          maintenance_duration_minutes: nextDurationMinutes,
        } : {}),
        note: "", technician_note: "",
        photos_b64: [], photos: [], videos: [],
        manager_confirmation_status: extraManagerConfirmationStatus,
        ...(extraManagerConfirmedAt ? {
          manager_confirmed_at: extraManagerConfirmedAt,
          manager_confirmed_by_id: user._id,
          manager_confirmed_by_name: user.full_name,
          manager_confirmed_by_role: user.role,
        } : {}),
        technician_id: nextResponsibleId, technician_name: nextResponsibleName,
        ...(useExternalService ? { technician_source: "external_service", ...(externalServiceName ? { external_service_name: externalServiceName } : {}) } : { technician_source: "internal" }),
        other_technician_ids: useExternalService ? [] : effectiveOtherTechnicians.map((technician) => technician.id),
        other_technicians: useExternalService ? [] : effectiveOtherTechnicians,
        technician_contributions: extraTechnicianContributions,
        ...(extraClientRequestId ? { client_request_id: extraClientRequestId } : {}),
        technician_type: useExternalService ? undefined : nextResponsibleType,
        created_at: record.created_at, backdated: !!record.backdated,
        group_id: groupId, grouped_with: record.type_label,
      });
      await recomputeLastMaintenance(db, record.engine_id, ex.type_key);
    }
  }

  invalidateMaintenancePanelServerCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  await ensureAppIndexes(db);
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(req, "records-delete", 60, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const recordId = parseRecordId(id);
  if (!recordId) return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const recordsCol = db.collection("maintenance_records") as any;
  const record = await recordsCol.findOne({ _id: recordId });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (!canModify(user, record)) return NextResponse.json({ error: "Bu kaydı silme yetkiniz yok." }, { status: 403 });

  await recordsCol.deleteOne({ _id: record._id });
  await recomputeLastMaintenance(db, record.engine_id, record.type_key);
  await writeAuditLog(db, {
    user,
    action: "delete",
    entity: "maintenance_record",
    entityId: id,
    summary: `${record.engine_name} · ${record.type_label} bakım kaydı silindi; motor bakım takibi yeniden hesaplandı`,
    before: record,
  });

  invalidateMaintenancePanelServerCache();
  return NextResponse.json({ ok: true });
}
