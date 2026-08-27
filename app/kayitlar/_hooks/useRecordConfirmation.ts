"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { EXTERNAL_SERVICE_TECHNICIAN_ID } from "@/lib/technicians";
import type { MaintenanceRecord } from "../_types";
import { confirmationContributionRows, hoursInputToMinutes, minutesToHoursInput } from "../_lib/recordDisplay";

interface ConfirmationUser {
  id?: string;
  _id?: string;
  full_name: string;
  role?: string;
}

interface UseRecordConfirmationOptions {
  user: ConfirmationUser | null | undefined;
  setRecords: Dispatch<SetStateAction<MaintenanceRecord[]>>;
  setSelectedRecord: Dispatch<SetStateAction<MaintenanceRecord | null>>;
}

interface ConfirmationResponse {
  confirmed_at?: string;
  confirmed_by_name?: string;
  confirmed_ids?: string[];
  engine_id?: string;
  engine_name?: string;
  technician_contributions?: NonNullable<MaintenanceRecord["technician_contributions"]>;
  error?: string;
}

export function useRecordConfirmation({ user, setRecords, setSelectedRecord }: UseRecordConfirmationOptions) {
  const [confirmationRecord, setConfirmationRecord] = useState<MaintenanceRecord | null>(null);
  const [confirmationEngineId, setConfirmationEngineId] = useState("");
  const [confirmationDurations, setConfirmationDurations] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const confirmationRows = useMemo(
    () => confirmationRecord ? confirmationContributionRows(confirmationRecord) : [],
    [confirmationRecord],
  );
  const confirmationTotalMinutes = useMemo(
    () => confirmationRows.reduce((total, row) => total + (hoursInputToMinutes(confirmationDurations[row.id] || "") || 0), 0),
    [confirmationDurations, confirmationRows],
  );
  const isExternalService = confirmationRecord
    ? confirmationRecord.technician_source === "external_service" || confirmationRecord.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID
    : false;

  function openConfirmation(record: MaintenanceRecord) {
    if (user?.role !== "yonetici" || record.manager_confirmation_status !== "pending") return;
    const rows = confirmationContributionRows(record);
    setConfirmationRecord(record);
    setConfirmationEngineId(record.engine_id);
    setConfirmationDurations(Object.fromEntries(rows.map((row) => [row.id, minutesToHoursInput(row.duration_minutes)])));
  }

  async function confirmRecord(record: MaintenanceRecord, durationInputs: Record<string, string>, selectedEngineId: string) {
    if (user?.role !== "yonetici" || record.manager_confirmation_status !== "pending" || confirmingId === record._id) return;
    const rows = confirmationContributionRows(record);
    const recordIsExternalService = record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID;
    const technicianContributions = recordIsExternalService ? [] : rows.map((row) => ({
      id: row.id,
      duration_minutes: hoursInputToMinutes(durationInputs[row.id] || "") ?? -1,
    }));
    if (!recordIsExternalService && technicianContributions.some((item) => item.duration_minutes <= 0)) {
      toast.error("Teyit için tüm çalışan kişilerin saatini 0’dan büyük girin.");
      return;
    }
    if (!window.confirm("Kişi bazlı çalışma sürelerini kontrol ettim ve bu bakım kaydını teyit etmek istiyorum.")) return;
    setConfirmingId(record._id);
    try {
      const res = await fetch(`/api/records/${record._id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(selectedEngineId && selectedEngineId !== record.engine_id ? { engine_id: selectedEngineId } : {}),
          technician_contributions: technicianContributions,
        }),
      });
      const data = await res.json().catch(() => ({})) as ConfirmationResponse;
      if (!res.ok) {
        toast.error(data.error || "Bakım kaydı teyit edilemedi.");
        return;
      }
      const confirmedIds = new Set(data.confirmed_ids?.length ? data.confirmed_ids : [record._id]);
      const applyConfirmation = (item: MaintenanceRecord): MaintenanceRecord => confirmedIds.has(item._id) ? {
        ...item,
        manager_confirmation_status: "confirmed",
        manager_confirmed_at: data.confirmed_at || new Date().toISOString(),
        manager_confirmed_by_id: user.id || user._id,
        manager_confirmed_by_name: data.confirmed_by_name || user.full_name,
        manager_confirmed_by_role: user.role,
        ...(data.engine_id ? { engine_id: data.engine_id } : {}),
        ...(data.engine_name ? { engine_name: data.engine_name } : {}),
        ...(data.technician_contributions ? { technician_contributions: data.technician_contributions } : {}),
      } : item;
      setRecords((current) => current.map(applyConfirmation));
      setSelectedRecord((current) => current ? applyConfirmation(current) : current);
      setConfirmationRecord(null);
      setConfirmationEngineId("");
      setConfirmationDurations({});
      toast.success("Kişi bazlı çalışma süreleri kaydedildi ve bakım teyit edildi.");
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch {
      toast.error("Teyit işlemi sırasında sunucu hatası oluştu.");
    } finally {
      setConfirmingId(null);
    }
  }

  function closeConfirmation() {
    setConfirmationRecord(null);
    setConfirmationEngineId("");
    setConfirmationDurations({});
  }

  return {
    confirmationRecord,
    setConfirmationRecord,
    confirmationEngineId,
    setConfirmationEngineId,
    confirmationDurations,
    setConfirmationDurations,
    confirmationRows,
    confirmationTotalMinutes,
    confirmingId,
    isExternalService,
    openConfirmation,
    confirmRecord,
    closeConfirmation,
  };
}
