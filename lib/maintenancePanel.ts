import type { Engine, MaintenanceType } from "@/lib/types";
import { cachedFetch } from "@/lib/apiCache";
import type { PanelItem } from "@/lib/status";

export type PanelEngine = Pick<Engine, "_id" | "name" | "hours" | "load_kw">;

export interface MaintenancePanelResponse {
  items: PanelItem[];
  engines: PanelEngine[];
  types: MaintenanceType[];
}

export function getMaintenancePanel(ttlMs = 15_000): Promise<MaintenancePanelResponse> {
  return cachedFetch<MaintenancePanelResponse>("/api/maintenance-types/panel", ttlMs);
}
