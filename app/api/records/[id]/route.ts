import { enginesCollection, maintenanceTypesCollection, recordsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { refreshUserMaintenanceNotificationsBestEffort } from "@/lib/notifications";
import { buildEngineStateUpdate, recomputeLastMaintenance } from "@/lib/maintenance";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, EXTERNAL_SERVICE_TECHNICIAN_NAME, canTechnicianWorkOnType, normalizeTechnicianPermissions, normalizeTechnicianType, resolveTechnicianOptions, type TechnicianOption } from "@/lib/technicians";
import { calculateMaintenanceDurationFromDates, normalizeTechnicianContributionDuration } from "@/lib/maintenanceTime";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { legacyMediaTooLarge, LEGACY_MEDIA_LIMIT_LABEL } from "@/lib/mediaValidation";
import { normalizeReportAttachments } from "@/lib/reportAttachments";
import { reassignMaintenanceRecordEngine, type ReassignMaintenanceEngineResult } from "@/lib/reassignMaintenanceEngine";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";
import { recordSchema, formatZodError } from "@/lib/schemas";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";
import { MAX_RECORD_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";
import { withApiTiming } from "@/lib/performance";
import { getRecord } from "./_lib/recordRead";
import { deleteRecord } from "./_lib/recordDelete";
import { canModify, parseRecordId } from "./_lib/recordDetailHelpers";
import type { MaintenanceTechnicianContribution } from "@/lib/types";

export const dynamic = "force-dynamic";

async function patchRecord(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(req, "records-update", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;
  await ensureAppIndexes(db);

  const recordId = parseRecordId(id);
  if (!recordId) return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const recordsCol = recordsCollection(db);
  const record = await recordsCol.findOne({ _id: recordId });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (!canModify(user, record)) return NextResponse.json({ error: "Bu kaydı düzenleme yetkiniz yok." }, { status: 403 });

  const bodyResult = await parseJsonBodyLimited(req, MAX_RECORD_REQUEST_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.tooLarge ? "Bakım kaydı isteği izin verilen boyutu aşıyor." : "Geçersiz bakım kaydı verisi." },
      { status: bodyResult.tooLarge ? 413 : 400 },
    );
  }
  const parsedBody = recordSchema.partial().safeParse(bodyResult.value);
  if (!parsedBody.success) {
    return NextResponse.json({ error: formatZodError(parsedBody.error) }, { status: 400 });
  }
  const safeBody = parsedBody.data;
  const clientRequestId = safeBody.client_request_id;
  const { engine_id: requestedEngineId, hour_at_completion, note, technician_note, photos_b64, photos, videos, report_attachments, pressure_reading, extra_types, other_technician_ids, other_technician_durations, responsible_technician_id, responsible_technician_duration, technician_source, external_service_name, time_tracking_version, maintenance_start_at, maintenance_end_at } = safeBody;
  const engineChangeRequested = typeof requestedEngineId === "string" && requestedEngineId.trim() !== record.engine_id;
  if (engineChangeRequested && user.role !== "yonetici") {
    return NextResponse.json({ error: "Bakım kaydının motorunu yalnızca yöneticiler değiştirebilir." }, { status: 403 });
  }
  let requestedEngineName = record.engine_name;
  if (engineChangeRequested) {
    if (!requestedEngineId || !isSafeMongoPathSegment(requestedEngineId.trim())) {
      return NextResponse.json({ error: "Geçersiz yeni motor kimliği." }, { status: 400 });
    }
    const requestedEngine = await enginesCollection(db).findOne({ _id: requestedEngineId.trim() }, { projection: { _id: 1, name: 1 } });
    if (!requestedEngine) return NextResponse.json({ error: "Yeni motor bulunamadı." }, { status: 404 });
    requestedEngineName = String(requestedEngine.name || requestedEngineId.trim());
  }

  if (legacyMediaTooLarge(photos_b64, videos)) {
    return NextResponse.json({ error: `Eski base64 medya toplamı ${LEGACY_MEDIA_LIMIT_LABEL} sınırını aşamaz. Fotoğraf/video yüklemelerini Blob üzerinden yapın.` }, { status: 413 });
  }
  if (report_attachments?.some((attachment) => attachment.url.startsWith("offline:"))) {
    return NextResponse.json({ error: "Rapor eklerinden biri henüz senkronize edilmedi. İnternet bağlantısını kontrol edip tekrar deneyin." }, { status: 400 });
  }
  const normalizedReportAttachments = report_attachments === undefined ? undefined : normalizeReportAttachments(report_attachments, user._id);
  if (report_attachments && normalizedReportAttachments && normalizedReportAttachments.length !== report_attachments.length) {
    return NextResponse.json({ error: "Rapor eklerinden biri geçersiz veya güvenilir Blob URL’si değil." }, { status: 400 });
  }

  type RecordUpdate = Partial<MaintenanceRecordDocument> & { $unset?: Record<string, ""> };
  const update: RecordUpdate = {};
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
    return NextResponse.json({ error: "Dış hizmet kaydını yalnızca yöneticiler düzenleyebilir." }, { status: 403 });
  }
  if (responsible_technician_duration !== undefined && (user.role !== "yonetici" || useExternalService)) {
    return NextResponse.json({ error: "Sorumlu teknisyen çalışma süresini yalnızca yönetici, iç ekip kayıtlarında düzenleyebilir." }, { status: 403 });
  }
  if (responsible_technician_duration !== undefined && (!Number.isFinite(responsible_technician_duration) || responsible_technician_duration <= 0)) {
    return NextResponse.json({ error: "Sorumlu teknisyen için 0’dan büyük çalışma süresi girilmelidir." }, { status: 400 });
  }
  const externalServiceName = typeof external_service_name === "string" ? external_service_name.trim() : (record.external_service_name || "");
  const groupedTypeKeys = record.group_id ? (await recordsCol.find({ group_id: record.group_id }, { projection: { type_key: 1 }, limit: 50 }).toArray()).map((item) => item.type_key) : [];
  const historicalTypeKeys = [...new Set([record.type_key, ...groupedTypeKeys])];
  const nextGroupId = record.group_id || (Array.isArray(extra_types) && extra_types.length > 0 ? new ObjectId().toString() : null);
  const historicalTypeKeySet = new Set(historicalTypeKeys);
  const requestedExtraTypeKeys = Array.isArray(extra_types)
    ? extra_types.map((item) => item.type_key).filter((key: unknown): key is string => typeof key === "string" && key.length > 0)
    : [];
  const selectedTypeKeys = [...new Set([...historicalTypeKeys, ...requestedExtraTypeKeys])];
  const allSelectedTypeDocs = await maintenanceTypesCollection(db).find(
    { _id: { $in: selectedTypeKeys } },
    { projection: { _id: 1, label: 1, is_deleted: 1, work_domains: 1, allow_electromechanical_support: 1, allow_electromechanical_responsible: 1, engine_states: 1 } },
  ).toArray();
  // Geçmiş kaydın mevcut türü artık arşivlenmiş olsa bile temel düzenlemeler engellenmez.
  // Ancak yeni eklenmek istenen türler mutlaka aktif olmalıdır.
  const selectedTypeDocs = allSelectedTypeDocs.filter((type) => type.is_deleted !== true || historicalTypeKeySet.has(String(type._id)));
  if (selectedTypeDocs.length !== selectedTypeKeys.length) return NextResponse.json({ error: "Seçilen bakım türlerinden biri bulunamadı veya artık aktif değil." }, { status: 404 });
  let nextResponsibleId = useExternalService ? EXTERNAL_SERVICE_TECHNICIAN_ID : record.technician_id;
  let nextResponsibleName = useExternalService
    ? (externalServiceName ? `${EXTERNAL_SERVICE_TECHNICIAN_NAME} · ${externalServiceName}` : EXTERNAL_SERVICE_TECHNICIAN_NAME)
    : record.technician_name;
  let nextResponsibleType = useExternalService ? undefined : normalizeTechnicianType(record.technician_type);
  let nextResponsibleOption: TechnicianOption | null = null;
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
    if ((record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID) && typeof responsible_technician_id !== "string") {
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
      ? record.other_technicians
        .filter((technician) => typeof technician.id === "string" && typeof technician.full_name === "string")
        .map((technician) => ({
          id: technician.id,
          full_name: technician.full_name,
          technician_type: normalizeTechnicianType(technician.technician_type),
        }))
      : [];
    if (Array.isArray(other_technician_ids)) {
      const resolvedOtherTechnicians = await resolveTechnicianOptions(db, other_technician_ids);
      if (!resolvedOtherTechnicians || resolvedOtherTechnicians.some((technician) => technician.id === nextResponsibleId)) {
        return NextResponse.json({ error: "Sorumlu teknisyen yardımcı listesine eklenemez veya seçilen teknisyen geçersiz." }, { status: 400 });
      }
      const existingSupportIds = new Set((record.other_technician_ids || []).map((id: unknown) => String(id)));
      if (resolvedOtherTechnicians.some((technician) => !existingSupportIds.has(technician.id) && !selectedTypeDocs.every((type) => canTechnicianWorkOnType(technician, type, "support")))) {
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
  const keepHistoricalResponsible = user.role === "yonetici" && responsible_technician_id === undefined && nextResponsibleId === record.technician_id;
  const responsibleSelectionChanged = typeof responsible_technician_id === "string" && responsible_technician_id !== record.technician_id;
  if (!useExternalService && !isExistingOwnerUpdate && (user.role !== "yonetici" || responsibleSelectionChanged || (Array.isArray(extra_types) && extra_types.length > 0))) {
    if (!nextResponsibleOption && nextResponsibleId === user._id) {
        const technicianType = nextResponsibleType || normalizeTechnicianType(user.technician_type);
        nextResponsibleOption = { id: user._id, full_name: user.full_name, technician_type: technicianType, ...normalizeTechnicianPermissions(user, technicianType) };
    }
    if (!nextResponsibleOption) {
      const resolvedCurrentResponsible = await resolveTechnicianOptions(db, [nextResponsibleId]);
      const fallbackTechnicianType = nextResponsibleType || "mekanik";
      nextResponsibleOption = resolvedCurrentResponsible?.[0] || { id: nextResponsibleId, full_name: nextResponsibleName, technician_type: fallbackTechnicianType, ...normalizeTechnicianPermissions({}, fallbackTechnicianType) };
    }
    const responsibleOption = nextResponsibleOption;
    const responsibleTypesToValidate = keepHistoricalResponsible
      ? selectedTypeDocs.filter((type) => !historicalTypeKeySet.has(String(type._id)))
      : selectedTypeDocs;
    if (responsibleOption && responsibleTypesToValidate.length > 0 && !responsibleTypesToValidate.every((type) => canTechnicianWorkOnType(responsibleOption, type, "responsible"))) {
      return NextResponse.json({ error: "Seçilen sorumlu teknisyen, bu bakım türlerinden en az biri için yetkili değil." }, { status: 403 });
    }
  }
  const existingResponsibleContribution = Array.isArray(record.technician_contributions)
    ? record.technician_contributions.find((contribution) => contribution?.id === nextResponsibleId && contribution?.contribution_role === "responsible")
    : undefined;
  const responsibleDurationMinutes = user.role === "yonetici" && responsible_technician_duration !== undefined
    ? responsible_technician_duration
    : nextResponsibleId === record.technician_id && typeof existingResponsibleContribution?.duration_minutes === "number"
      ? existingResponsibleContribution.duration_minutes
      : nextDurationMinutes ?? 0;
  const existingSupportContributions: Map<string, { duration_minutes?: unknown }> = new Map(
    (Array.isArray(record.technician_contributions) ? record.technician_contributions : [])
      .filter((contribution) => contribution?.contribution_role === "support" && typeof contribution.id === "string")
      .map((contribution) => [contribution.id, { duration_minutes: contribution.duration_minutes }] as const),
  );
  const supportDurationMinutes = (technicianId: string): number => {
    const requestedDuration = other_technician_durations?.[technicianId];
    if (requestedDuration !== undefined) return normalizeTechnicianContributionDuration(requestedDuration, nextDurationMinutes ?? 0);
    const existingDuration = existingSupportContributions.get(technicianId)?.duration_minutes;
    return typeof existingDuration === "number"
      ? normalizeTechnicianContributionDuration(existingDuration, nextDurationMinutes ?? 0)
      : normalizeTechnicianContributionDuration(undefined, nextDurationMinutes ?? 0);
  };
  const technicianContributions: MaintenanceTechnicianContribution[] = useExternalService ? [] : [
    { id: nextResponsibleId, full_name: nextResponsibleName, technician_type: nextResponsibleType, contribution_role: "responsible" as const, duration_minutes: responsibleDurationMinutes },
    ...effectiveOtherTechnicians.map((technician) => ({
      ...technician,
      contribution_role: "support" as const,
      duration_minutes: supportDurationMinutes(technician.id),
    })),
  ];
  if (user.role === "yonetici" && !useExternalService && technicianContributions.some((contribution) => contribution.duration_minutes <= 0)) {
    return NextResponse.json({ error: "İç ekipteki her teknisyen için 0’dan büyük çalışma süresi girilmelidir." }, { status: 400 });
  }
  if (!useExternalService && nextDurationMinutes !== null && technicianContributions.some((contribution) => contribution.duration_minutes > nextDurationMinutes)) {
    return NextResponse.json({ error: "Kişi çalışma süresi toplam bakım süresini aşamaz." }, { status: 400 });
  }
  update.technician_contributions = technicianContributions;
  const effectiveEngineId = requestedEngineId?.trim() || record.engine_id;
  const effectiveEngineName = engineChangeRequested ? requestedEngineName : record.engine_name;
  if (engineChangeRequested) {
    update.engine_id = effectiveEngineId;
    update.engine_name = effectiveEngineName;
  }
  if (typeof nextGroupId === "string") update.group_id = nextGroupId;
  if (typeof hour_at_completion === "number") update.hour_at_completion = hour_at_completion;
  if (typeof note === "string") update.note = note;
  if (typeof technician_note === "string") update.technician_note = technician_note;
  if (Array.isArray(photos_b64)) update.photos_b64 = photos_b64;
  if (Array.isArray(photos)) update.photos = photos;
  if (Array.isArray(videos)) update.videos = videos;
  if (Array.isArray(normalizedReportAttachments)) update.report_attachments = normalizedReportAttachments;
  if (typeof pressure_reading === "number") update.pressure_reading = pressure_reading;

  const { $unset: unset, ...setFields } = update;
  const sharedSetFields: Record<string, unknown> = {
    technician_id: nextResponsibleId,
    technician_name: nextResponsibleName,
    technician_source: useExternalService ? "external_service" : "internal",
    other_technician_ids: useExternalService ? [] : effectiveOtherTechnicians.map((technician) => technician.id),
    other_technicians: useExternalService ? [] : effectiveOtherTechnicians,
    technician_contributions: technicianContributions,
  };
  if (typeof nextGroupId === "string") sharedSetFields.group_id = nextGroupId;
  if (!useExternalService && nextResponsibleType) sharedSetFields.technician_type = nextResponsibleType;
  if (useExternalService && externalServiceName) sharedSetFields.external_service_name = externalServiceName;
  if (typeof hour_at_completion === "number") sharedSetFields.hour_at_completion = hour_at_completion;
  if (time_tracking_version === 2) {
    sharedSetFields.time_tracking_version = 2;
    sharedSetFields.maintenance_start_at = nextStartAt;
    sharedSetFields.maintenance_end_at = nextEndAt;
    sharedSetFields.maintenance_duration_minutes = nextDurationMinutes;
  }
  const sharedUnset: Record<string, ""> = {};
  if (useExternalService) sharedUnset.technician_type = "";
  if (useExternalService ? !externalServiceName : true) sharedUnset.external_service_name = "";
  const groupFilter = record.group_id ? { group_id: record.group_id, _id: { $ne: record._id } } : null;
  const sharedUpdate = {
    $set: sharedSetFields,
    ...(Object.keys(sharedUnset).length > 0 ? { $unset: sharedUnset } : {}),
  };
  let engineReassignment: ReassignMaintenanceEngineResult | null = null;

  const runRecordMutation = async (session?: import("mongodb").ClientSession): Promise<void> => {
    const options = session ? { session } : {};
    if (engineChangeRequested) {
      engineReassignment = await reassignMaintenanceRecordEngine(db, record, effectiveEngineId, session);
    }

    await recordsCol.updateOne({ _id: record._id }, { $set: setFields, ...(unset ? { $unset: unset } : {}) }, options);
    if (groupFilter) await recordsCol.updateMany(groupFilter, sharedUpdate, options);
    await writeAuditLog(db, {
      user,
      action: "update",
      entity: "maintenance_record",
      entityId: id,
      summary: `${record.engine_name} · ${record.type_label} bakım kaydı güncellendi${engineChangeRequested ? `; motor ${record.engine_name} → ${effectiveEngineName} taşındı` : ""}`,
      before: record,
      after: { ...update, ...(engineChangeRequested ? { engine_id: effectiveEngineId, engine_name: effectiveEngineName, moved_record_ids: engineReassignment?.movedRecordIds || [id] } : {}) },
      session,
    });

    if (typeof hour_at_completion === "number" && (engineChangeRequested || hour_at_completion !== record.hour_at_completion)) {
      const enginesCol = enginesCollection(db);
      const engine = await enginesCol.findOne({ _id: effectiveEngineId }, options);
      if (engine && hour_at_completion > Number(engine.hours || 0)) {
        const stamp = new Date();
        const historyEntry = { date: stamp.toISOString(), hours: hour_at_completion, load_kw: engine.load_kw || 0 };
        await enginesCol.updateOne(
          { _id: effectiveEngineId },
          Array.isArray(engine.history)
            ? { $set: { hours: hour_at_completion, updated_at: stamp }, $push: { history: historyEntry } }
            : { $set: { hours: hour_at_completion, updated_at: stamp, history: [historyEntry] } },
          options,
        );
      }
    }

    // Bu kaydı düzenlerken birlikte tamamlanan ama daha önce hiç kaydedilmemiş başka bakımlar da ekleniyorsa,
    // her biri aynı motor/grup olayına bağlanır; kişi katkı süresi bakım türü başına çoğalmaz.
    if (Array.isArray(extra_types) && extra_types.length > 0) {
      const groupId = nextGroupId || record.group_id;
      if (!groupId) throw new Error("Bakım grubu oluşturulamadı.");
      const finalHour = typeof hour_at_completion === "number" ? hour_at_completion : record.hour_at_completion;
      const extraTechnicianContributions: MaintenanceTechnicianContribution[] = technicianContributions;
      const extraManagerConfirmationStatus = record.manager_confirmation_status || (user.role === "yonetici" ? "confirmed" : "pending");
      const extraManagerConfirmedAt = extraManagerConfirmationStatus === "confirmed" ? new Date() : undefined;
      const typesCol = maintenanceTypesCollection(db);

      for (const ex of extra_types) {
        const extraClientRequestId = `${clientRequestId || `record:${String(record._id)}`}:extra:${String(ex.type_key)}`;
        const existingExtra = await recordsCol.findOne(
          {
            $or: [
              { group_id: groupId, type_key: ex.type_key },
              ...(extraClientRequestId ? [{ client_request_id: extraClientRequestId }] : []),
            ],
          },
          { projection: { _id: 1 }, ...options },
        );
        if (existingExtra) continue;
        if (typeof ex.period === "number" && isSafeMongoPathSegment(effectiveEngineId)) {
          const extraTypeState = selectedTypeDocs.find((type) => String(type._id) === ex.type_key)?.engine_states;
          await typesCol.updateOne(
            { _id: ex.type_key },
            { $set: buildEngineStateUpdate(extraTypeState, effectiveEngineId, { period_hours: ex.period }) },
            { upsert: true, ...options },
          );
        }
        const extraType = selectedTypeDocs.find((type) => String(type._id) === ex.type_key);
        await recordsCol.insertOne({
          engine_id: effectiveEngineId, engine_name: effectiveEngineName,
          type_key: ex.type_key, type_label: extraType?.label || ex.type_label,
          hour_at_completion: finalHour,
          ...(nextStartAt && nextEndAt && nextDurationMinutes ? {
            time_tracking_version: 2,
            maintenance_start_at: nextStartAt,
            maintenance_end_at: nextEndAt,
            maintenance_duration_minutes: nextDurationMinutes,
          } : {}),
          note: "", technician_note: "", photos_b64: [], photos: [], videos: [], report_attachments: [],
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
        }, options);
      }
    }

    const affectedTypeKeys = [...new Set([...historicalTypeKeys, ...requestedExtraTypeKeys])];
    if (engineChangeRequested || (typeof hour_at_completion === "number" && hour_at_completion !== record.hour_at_completion) || (Array.isArray(extra_types) && extra_types.length > 0)) {
      await Promise.all(affectedTypeKeys.map((typeKey) => recomputeLastMaintenance(db, effectiveEngineId, typeKey, undefined, session)));
    }
  };

  if (engineChangeRequested) {
    const session = (await getMongoClient()).startSession();
    try {
      await session.withTransaction(async () => runRecordMutation(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Motor değişikliği uygulanamadı.";
      const status = /bulunamadı|geçersiz|oluşturulamadı/iu.test(message) ? 400 : 500;
      return NextResponse.json({ error: status === 500 ? "Motor değişikliği güvenli biçimde tamamlanamadı; kayıt değiştirilmedi." : message }, { status });
    } finally {
      await session.endSession();
    }
  } else {
    await runRecordMutation();
  }

  invalidateMaintenancePanelServerCache();
  await refreshUserMaintenanceNotificationsBestEffort(db, user);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("GET /api/records/[id]", () => getRecord(req, context), { request: req });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("PATCH /api/records/[id]", () => patchRecord(req, context), { request: req });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("DELETE /api/records/[id]", () => deleteRecord(req, context), { request: req });
}
