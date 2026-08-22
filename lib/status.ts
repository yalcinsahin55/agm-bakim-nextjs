import type { Engine, MaintenanceType, EngineState } from "./types";

export const KRITIK_ESIK = 100;
export const YAKLASIYOR_ESIK = 250;

export type StatusKey = "gecikmis" | "kritik" | "yaklasiyor" | "normal";

export const STATUS_LABELS: Record<StatusKey, string> = {
  gecikmis: "Gecikmiş",
  kritik: "Kritik",
  yaklasiyor: "Yaklaşıyor",
  normal: "Normal",
};

export const STATUS_COLORS: Record<StatusKey, string> = {
  gecikmis: "#ef4a52",
  kritik: "#f2994a",
  yaklasiyor: "#f0c93d",
  normal: "#33c98a",
};

export type RoleKey = "yonetici" | "planlamaci" | "teknisyen" | "goruntuleyici";

export const ROLE_LABELS: Record<RoleKey, string> = {
  yonetici: "Yönetici",
  planlamaci: "Teknisyen (eski Planlamacı)",
  teknisyen: "Teknisyen",
  goruntuleyici: "Görüntüleyici",
};

export function remainingHours(engineHours: number, lastHour: number, period: number): number {
  return period - (engineHours - lastHour);
}

export function statusFor(remaining: number): StatusKey {
  if (remaining <= 0) return "gecikmis";
  if (remaining <= KRITIK_ESIK) return "kritik";
  if (remaining <= YAKLASIYOR_ESIK) return "yaklasiyor";
  return "normal";
}

export function engineSortKey(name: string): number {
  const digits = (name.match(/\d+/) || ["0"])[0];
  return parseInt(digits, 10);
}

export function sortEngineNames(names: string[]): string[] {
  return [...names].sort((a, b) => engineSortKey(a) - engineSortKey(b));
}

export interface PanelItem {
  engine_id: string;
  engine_name: string;
  type_key: string;
  type_label: string;
  engine_hours: number;
  last_hour: number;
  period: number;
  remaining: number;
  status: StatusKey;
}

/** Motor + bakım türü verilerinden düz bir liste üretir (dashboard/motorlar/bakım türleri sayfalarının ortak veri kaynağı). */
export function buildItems(engines: Engine[], types: MaintenanceType[]): PanelItem[] {
  const items: PanelItem[] = [];
  const engineMap: Record<string, Engine> = {};
  engines.forEach((e) => { engineMap[e._id] = e; });

  types.forEach((t) => {
    const states = t.engine_states || {};
    const applicable = Object.keys(states).length ? Object.keys(states) : Object.keys(engineMap);
    applicable.forEach((engineId) => {
      const engine = engineMap[engineId];
      if (!engine) return;
      const state: EngineState = states[engineId] || { last_maintenance_hour: 0, period_hours: 0 };
      const lastHour = state.last_maintenance_hour ?? 0;
      const period = state.period_hours ?? t.default_period_hours;
      const remaining = remainingHours(engine.hours, lastHour, period);
      items.push({
        engine_id: engineId,
        engine_name: engine.name,
        type_key: t.key,
        type_label: t.label,
        engine_hours: engine.hours,
        last_hour: lastHour,
        period,
        remaining,
        status: statusFor(remaining),
      });
    });
  });

  return items;
}
