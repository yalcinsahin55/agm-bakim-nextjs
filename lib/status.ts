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

function normalizeEngineLookupKey(value: string): string {
  const compact = value.normalize("NFC").toLocaleLowerCase("tr-TR").replace(/[\s_-]+/g, "");
  const agm = compact.match(/^agm0*(\d{1,3})$/u);
  return agm ? `agm${Number(agm[1])}` : compact;
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function engineStateFor(states: Record<string, unknown>, engine: Engine): unknown {
  const direct = states[engine._id] ?? states[engine.name];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;
  const target = normalizeEngineLookupKey(engine.name);
  const matchingKey = Object.keys(states).find((key) => normalizeEngineLookupKey(key) === target);
  const matched = matchingKey ? states[matchingKey] : undefined;
  return matched && typeof matched === "object" && !Array.isArray(matched) ? matched : undefined;
}

/** Motor + bakım türü verilerinden düz bir liste üretir (dashboard/motorlar/bakım türleri sayfalarının ortak veri kaynağı). */
export function buildItems(engines: Engine[], types: MaintenanceType[]): PanelItem[] {
  const items: PanelItem[] = [];

  types.forEach((t) => {
    const rawStates = t.engine_states;
    const states: Record<string, unknown> = rawStates && !Array.isArray(rawStates) && typeof rawStates === "object" ? rawStates as Record<string, unknown> : {};
    const explicitScope = t.engine_scope === "explicit" || (t.engine_scope === undefined && Object.keys(states).length > 0);
    const applicableEngines = explicitScope ? engines.filter((engine) => engineStateFor(states, engine) !== undefined) : engines;
    applicableEngines.forEach((engine) => {
      const rawState = engineStateFor(states, engine);
      const state: Partial<EngineState> = rawState && typeof rawState === "object" && !Array.isArray(rawState) ? rawState as Partial<EngineState> : {};
      const engineHours = finiteNumber(engine.hours, 0);
      const lastHour = finiteNumber(state.last_maintenance_hour, 0);
      const period = finiteNumber(state.period_hours, finiteNumber(t.default_period_hours, 0));
      if (period <= 0) return;
      const remaining = remainingHours(engineHours, lastHour, period);
      items.push({
        engine_id: String(engine._id),
        engine_name: engine.name,
        type_key: t.key,
        type_label: t.label,
        engine_hours: engineHours,
        last_hour: lastHour,
        period,
        remaining,
        status: statusFor(remaining),
      });
    });
  });

  return items;
}
