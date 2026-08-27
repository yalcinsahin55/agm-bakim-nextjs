import { ObjectId } from "mongodb";
import { canWriteMaintenance } from "@/lib/permissions";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";
import type { User } from "@/lib/types";

export type RecordRouteContext = { params: Promise<{ id: string }> };

export function parseRecordId(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export function canModify(user: User, record: MaintenanceRecordDocument): boolean {
  return canWriteMaintenance(user.role) && (user.role === "yonetici" || record.technician_id === user._id);
}
