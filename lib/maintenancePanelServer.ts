import type { PanelItem } from "@/lib/status";
import type { MaintenanceType } from "@/lib/types";

export type ServerPanelEngine = {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
};

export interface ServerPanelPayload {
  items: PanelItem[];
  engines: ServerPanelEngine[];
  types: MaintenanceType[];
}

type PanelCache = {
  payload: ServerPanelPayload;
  expiresAt: number;
};

const PANEL_CACHE_TTL_MS = 10_000;
let panelCache: PanelCache | null = null;

export function getMaintenancePanelServerCache(now = Date.now()): ServerPanelPayload | null {
  if (!panelCache || panelCache.expiresAt <= now) return null;
  return panelCache.payload;
}

export function setMaintenancePanelServerCache(payload: ServerPanelPayload, now = Date.now()): void {
  panelCache = { payload, expiresAt: now + PANEL_CACHE_TTL_MS };
}

export function invalidateMaintenancePanelServerCache(): void {
  panelCache = null;
}
