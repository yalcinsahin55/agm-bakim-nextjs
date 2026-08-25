import type { Db } from "mongodb";
import { enginesCollection, maintenanceTypesCollection } from "@/lib/dbCollections";
import { buildItems, type PanelItem } from "@/lib/status";
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

/**
 * Dashboard ile aynı snapshot’ı kullanan salt-okunur server yolları için ortak veri kaynağı.
 * TTL kısa tutulur; mevcut mutation invalidation’ları cache’i ayrıca anında temizler.
 */
export async function getOrBuildMaintenancePanelServerPayload(db: Db, now = Date.now()): Promise<ServerPanelPayload> {
  const cachedPayload = getMaintenancePanelServerCache(now);
  if (cachedPayload) return cachedPayload;

  const [engines, types] = await Promise.all([
    enginesCollection(db).find({}, {
      projection: { _id: 1, name: 1, hours: 1, load_kw: 1 },
    }).toArray(),
    maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }, {
      projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, work_domains: 1, allow_electromechanical_support: 1, allow_electromechanical_responsible: 1, engine_states: 1 },
    }).toArray(),
  ]);
  const payload: ServerPanelPayload = { items: buildItems(engines, types), engines, types };
  setMaintenancePanelServerCache(payload, now);
  return payload;
}
