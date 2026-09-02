import type { Db } from "mongodb";
import type { AssistantQuery } from "@/lib/assistantPolicy";
import { listActiveTechnicians, TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import type { AssistantToolResponse } from "./types";

export async function getTechnicianDirectory(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  let technicians = await listActiveTechnicians(db);
  if (query.technicianRole === "responsible") technicians = technicians.filter((technician) => technician.can_be_responsible);
  if (query.technicianRole === "support") technicians = technicians.filter((technician) => technician.can_be_support);
  return {
    intent: "technician_directory",
    period: "all",
    title: "Aktif teknisyen listesi",
    summary: `${technicians.length} aktif ve onaylı teknisyen bulundu.`,
    data: {
      technicians: technicians.map((technician) => ({
        id: technician.id,
        full_name: technician.full_name,
        technician_type: technician.technician_type,
        technician_type_label: TECHNICIAN_TYPE_LABELS[technician.technician_type],
        can_be_responsible: technician.can_be_responsible,
        can_be_support: technician.can_be_support,
        allowed_work_domains: technician.allowed_work_domains,
      })),
    },
  };
}
