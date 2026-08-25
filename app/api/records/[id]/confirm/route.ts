import { recordsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { formatZodError, recordConfirmationSchema } from "@/lib/schemas";
import { writeAuditLog } from "@/lib/audit";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { EXTERNAL_SERVICE_TECHNICIAN_ID } from "@/lib/technicians";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";
import { withApiTiming } from "@/lib/performance";
import { reassignMaintenanceRecordEngine, type ReassignMaintenanceEngineResult } from "@/lib/reassignMaintenanceEngine";

export const dynamic = "force-dynamic";

interface StoredContribution {
  id: string;
  full_name: string;
  technician_type?: "mekanik" | "elektromekanik";
  contribution_role: "responsible" | "support";
  duration_minutes?: number;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeStoredContribution(value: unknown): StoredContribution | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.full_name !== "string") return null;
  return {
    id: item.id,
    full_name: item.full_name,
    technician_type: item.technician_type === "mekanik" || item.technician_type === "elektromekanik" ? item.technician_type : undefined,
    contribution_role: item.contribution_role === "support" ? "support" : "responsible",
    duration_minutes: typeof item.duration_minutes === "number" ? item.duration_minutes : undefined,
  };
}

function contributionRows(record: MaintenanceRecordDocument): StoredContribution[] {
  const storedRows = Array.isArray(record.technician_contributions)
    ? record.technician_contributions.map(normalizeStoredContribution).filter((item): item is StoredContribution => item !== null)
    : [];
  if (storedRows.length > 0) return storedRows;

  if (record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID) return [];

  const rows: StoredContribution[] = [];
  if (typeof record.technician_id === "string") {
    rows.push({
      id: record.technician_id,
      full_name: typeof record.technician_name === "string" ? record.technician_name : "Sorumlu teknisyen",
      technician_type: record.technician_type,
      contribution_role: "responsible",
      duration_minutes: typeof record.maintenance_duration_minutes === "number" ? record.maintenance_duration_minutes : undefined,
    });
  }
  if (Array.isArray(record.other_technicians)) {
    for (const item of record.other_technicians) {
      if (!item || typeof item.id !== "string" || typeof item.full_name !== "string") continue;
      rows.push({
        id: item.id,
        full_name: item.full_name,
        technician_type: item.technician_type,
        contribution_role: "support",
        duration_minutes: undefined,
      });
    }
  }
  return rows;
}

async function postConfirmation(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bakım kayıtlarını yalnızca yöneticiler teyit edebilir." }, { status: 403 });
  }
  const rateLimited = await enforceApiRateLimit(req, "record-confirm", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;
  await ensureAppIndexes(db);
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Kayıt kimliği geçersiz." }, { status: 400 });
  }

  const recordsCol = recordsCollection(db);
  const recordId = new ObjectId(id);
  const record = await recordsCol.findOne({ _id: recordId });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (record.manager_confirmation_status === "confirmed") {
    return NextResponse.json({ ok: true, alreadyConfirmed: true, confirmed_at: record.manager_confirmed_at, confirmed_by_name: record.manager_confirmed_by_name, confirmed_ids: [id] });
  }
  if (record.manager_confirmation_status !== "pending") {
    return NextResponse.json({ error: "Bu kayıt yeni yönetici teyit akışına dahil değil." }, { status: 409 });
  }

  const parsedBody = await req.json().catch(() => ({}));
  const parsed = recordConfirmationSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const expectedContributions = contributionRows(record);
  const submittedContributions = parsed.data.technician_contributions;
  const isExternalService = record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID;
  if (!isExternalService) {
    if (expectedContributions.length === 0) {
      return NextResponse.json({ error: "Kayıtta kişi bazlı teknisyen bilgisi bulunamadı; önce sorumlu teknisyeni düzenleyin." }, { status: 400 });
    }
    const expectedIds = new Set(expectedContributions.map((item) => item.id));
    const submittedIds = new Set(submittedContributions.map((item) => item.id));
    if (submittedIds.size !== submittedContributions.length || submittedIds.size !== expectedIds.size || [...expectedIds].some((technicianId) => !submittedIds.has(technicianId))) {
      return NextResponse.json({ error: "Teyit için kayıtta bulunan her teknisyen adına bir çalışma süresi girilmelidir." }, { status: 400 });
    }
  } else if (submittedContributions.length > 0) {
    return NextResponse.json({ error: "Dış hizmet kayıtlarında kişi bazlı teknisyen süresi girilemez." }, { status: 400 });
  }

  const totalMaintenanceMinutes = typeof record.maintenance_duration_minutes === "number" && Number.isFinite(record.maintenance_duration_minutes)
    ? record.maintenance_duration_minutes
    : null;
  const contributionById = new Map(submittedContributions.map((item) => [item.id, item.duration_minutes]));
  const normalizedContributions = expectedContributions.map((item) => {
    const durationMinutes = contributionById.get(item.id);
    return { ...item, duration_minutes: durationMinutes ?? 0 };
  });
  if (!isExternalService) {
    for (const contribution of normalizedContributions) {
      if (!isFinitePositive(contribution.duration_minutes)) {
        return NextResponse.json({ error: `${contribution.full_name} için geçerli bir çalışma süresi girilmelidir.` }, { status: 400 });
      }
      if (totalMaintenanceMinutes !== null && contribution.duration_minutes > totalMaintenanceMinutes) {
        return NextResponse.json({ error: `${contribution.full_name} için kişi süresi toplam bakım süresini aşamaz.` }, { status: 400 });
      }
    }
  }

  const confirmationScope = record.group_id
    ? { $or: [{ group_id: record.group_id }, { _id: recordId }] }
    : { _id: recordId };
  const requestedEngineId = parsed.data.engine_id;
  type ConfirmationResult = {
    alreadyConfirmed: boolean;
    confirmed_at?: unknown;
    confirmed_by_name?: string;
    confirmed_ids: string[];
    confirmed_count?: number;
    technician_contributions?: StoredContribution[];
    engine_reassignment?: ReassignMaintenanceEngineResult;
  };

  const runConfirmation = async (session?: import("mongodb").ClientSession): Promise<ConfirmationResult> => {
    const options = session ? { session } : {};
    let reassignment: ReassignMaintenanceEngineResult | null = null;
    const pendingBeforeMove = await recordsCol.find(
      { ...confirmationScope, manager_confirmation_status: "pending" },
      { projection: { _id: 1 }, ...options },
    ).toArray();
    if (pendingBeforeMove.length === 0) {
      const latest = await recordsCol.findOne(
        { _id: recordId },
        { projection: { manager_confirmation_status: 1, manager_confirmed_at: 1, manager_confirmed_by_name: 1 }, ...options },
      );
      return { alreadyConfirmed: latest?.manager_confirmation_status === "confirmed", confirmed_at: latest?.manager_confirmed_at, confirmed_by_name: latest?.manager_confirmed_by_name, confirmed_ids: [id] };
    }

    if (requestedEngineId && requestedEngineId.trim() !== record.engine_id) {
      reassignment = await reassignMaintenanceRecordEngine(db, record, requestedEngineId, session);
    }
    const effectiveEngineId = reassignment?.toEngineId || record.engine_id;
    const effectiveEngineName = reassignment?.toEngineName || record.engine_name;
    const pendingRecords = await recordsCol.find(
      { ...confirmationScope, manager_confirmation_status: "pending" },
      { projection: { _id: 1, engine_name: 1, type_label: 1 }, ...options },
    ).toArray();
    if (pendingRecords.length === 0) {
      const latest = await recordsCol.findOne(
        { _id: recordId },
        { projection: { manager_confirmation_status: 1, manager_confirmed_at: 1, manager_confirmed_by_name: 1 }, ...options },
      );
      return { alreadyConfirmed: latest?.manager_confirmation_status === "confirmed", confirmed_at: latest?.manager_confirmed_at, confirmed_by_name: latest?.manager_confirmed_by_name, confirmed_ids: [id] };
    }

    const confirmedAt = new Date();
    const confirmation: Pick<MaintenanceRecordDocument, "manager_confirmation_status" | "manager_confirmed_at" | "manager_confirmed_by_id" | "manager_confirmed_by_name" | "manager_confirmed_by_role" | "technician_contributions"> = {
      manager_confirmation_status: "confirmed",
      manager_confirmed_at: confirmedAt,
      manager_confirmed_by_id: user._id,
      manager_confirmed_by_name: user.full_name,
      manager_confirmed_by_role: user.role,
      technician_contributions: normalizedContributions,
    };
    const result = await recordsCol.updateMany(
      { ...confirmationScope, manager_confirmation_status: "pending" },
      { $set: confirmation },
      options,
    );
    const confirmedIds = pendingRecords.map((item) => String(item._id));
    const confirmedCount = Number(result.modifiedCount || 0);

    await writeAuditLog(db, {
      user,
      action: "update",
      entity: "maintenance_record",
      entityId: record.group_id || id,
      summary: `${record.engine_name} · ${record.type_label}${reassignment?.changed ? `; motor ${record.engine_name} → ${effectiveEngineName}` : ""}${confirmedCount > 1 ? ` ve ${confirmedCount - 1} ilişkili bakım` : ""} yönetici tarafından kişi süreleriyle teyit edildi`,
      before: { engine_id: record.engine_id, engine_name: record.engine_name, manager_confirmation_status: "pending", affected_record_count: pendingRecords.length, technician_contributions: record.technician_contributions || [] },
      after: { ...confirmation, engine_id: effectiveEngineId, engine_name: effectiveEngineName, affected_record_count: confirmedCount, moved_record_ids: reassignment?.movedRecordIds || [] },
      session,
    });

    return { alreadyConfirmed: false, confirmed_at: confirmedAt, confirmed_by_name: user.full_name, confirmed_ids: confirmedIds, confirmed_count: confirmedCount, technician_contributions: normalizedContributions, ...(reassignment ? { engine_reassignment: reassignment } : {}) };
  };

  let confirmationResult: ConfirmationResult | undefined;
  if (requestedEngineId && requestedEngineId.trim() !== record.engine_id) {
    const session = (await getMongoClient()).startSession();
    try {
      await session.withTransaction(async () => {
        confirmationResult = await runConfirmation(session);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Motor değişikliği ve teyit işlemi tamamlanamadı.";
      const status = /bulunamadı|geçersiz/iu.test(message) ? 400 : 500;
      return NextResponse.json({ error: status === 500 ? "Motor değişikliği ve teyit güvenli biçimde tamamlanamadı; kayıt değiştirilmedi." : message }, { status });
    } finally {
      await session.endSession();
    }
  } else {
    confirmationResult = await runConfirmation();
  }

  if (!confirmationResult) return NextResponse.json({ error: "Teyit sonucu alınamadı." }, { status: 500 });
  return NextResponse.json({
    ok: true,
    ...confirmationResult,
    ...(confirmationResult.engine_reassignment?.changed ? { engine_id: confirmationResult.engine_reassignment.toEngineId, engine_name: confirmationResult.engine_reassignment.toEngineName, moved_record_ids: confirmationResult.engine_reassignment.movedRecordIds } : {}),
  });

}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("POST /api/records/[id]/confirm", () => postConfirmation(req, context), { request: req });
}
