import type { Engine, MaintenanceType } from "@/lib/types";
import { cachedFetch, invalidateCachedFetch } from "@/lib/apiCache";
import type { PanelItem } from "@/lib/status";

export type PanelEngine = Pick<Engine, "_id" | "name" | "hours" | "load_kw">;

export interface MaintenancePanelResponse {
  items: PanelItem[];
  engines: PanelEngine[];
  types: MaintenanceType[];
}

const PANEL_URL = "/api/maintenance-types/panel";

export function getMaintenancePanel(ttlMs = 15_000): Promise<MaintenancePanelResponse> {
  return cachedFetch<MaintenancePanelResponse>(PANEL_URL, ttlMs);
}

export function invalidateMaintenancePanel(): void {
  invalidateCachedFetch(PANEL_URL);
}
