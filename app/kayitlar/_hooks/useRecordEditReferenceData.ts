import { useEffect, useState } from "react";
import type { MaintenanceType } from "@/lib/types";
import type { TechnicianOption } from "@/lib/technicians";

type GroupType = { type_key: string; type_label: string };

export interface RecordEditReferenceData {
  technicians: TechnicianOption[];
  maintenanceTypes: MaintenanceType[];
  groupTypes: GroupType[];
}

export function useRecordEditReferenceData(recordId: string, initialGroupTypes: GroupType[]): RecordEditReferenceData {
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<MaintenanceType[]>([]);
  const [groupTypes, setGroupTypes] = useState<GroupType[]>(() => initialGroupTypes);

  useEffect(() => {
    fetch("/api/users/technicians")
      .then(async (response) => { if (response.ok) setTechnicians(await response.json()); })
      .catch(() => {});
    fetch("/api/maintenance-types")
      .then(async (response) => { if (response.ok) setMaintenanceTypes(await response.json()); })
      .catch(() => {});
    fetch(`/api/records/${recordId}?include_group=true`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { group_types?: Array<{ type_key?: unknown; type_label?: unknown }> };
        if (Array.isArray(data.group_types)) {
          setGroupTypes(data.group_types.filter((type): type is GroupType => typeof type?.type_key === "string" && typeof type?.type_label === "string"));
        }
      })
      .catch(() => {});
  }, [recordId]);

  return { technicians, maintenanceTypes, groupTypes };
}
