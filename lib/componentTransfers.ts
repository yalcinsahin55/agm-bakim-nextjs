import type { ComponentTransfer, Engine } from "@/lib/types";

export const COMPONENT_TRANSFER_MAX_COUNT = 20;
export const COMPONENT_TRANSFER_MAX_NAME_LENGTH = 120;
export const COMPONENT_TRANSFER_MAX_NOTE_LENGTH = 500;
export const COMPONENT_OPTIONS = ["intercooler", "turbocharger", "alternatör", "yağ eşanjörü", "vibrasyon damperi"] as const;
export type ComponentName = typeof COMPONENT_OPTIONS[number];

export interface ComponentTransferDraft {
  id: string;
  component_name: string;
  condition: "new" | "used";
  source_engine_id: string;
  source_hours: string | number;
  installed_hours: string | number;
  note: string;
}

export function createComponentTransferDraft(): ComponentTransferDraft {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    component_name: "",
    condition: "used",
    source_engine_id: "",
    source_hours: "",
    installed_hours: "",
    note: "",
  };
}

export function normalizeComponentTransfers(input: unknown): ComponentTransfer[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, COMPONENT_TRANSFER_MAX_COUNT).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const componentName = typeof value.component_name === "string" && COMPONENT_OPTIONS.includes(value.component_name.trim() as ComponentName) ? value.component_name.trim() : "";
    const condition = value.condition === "new" ? "new" : "used";
    const sourceEngineId = typeof value.source_engine_id === "string" ? value.source_engine_id.trim().slice(0, 100) : "";
    const sourceEngineName = typeof value.source_engine_name === "string" ? value.source_engine_name.trim().slice(0, 120) : "";
    const sourceHours = Number(value.source_hours ?? 0);
    const installedHours = Number(value.installed_hours);
    if (!componentName || !Number.isFinite(sourceHours) || sourceHours < 0 || !Number.isFinite(installedHours) || installedHours < 0) return [];
    return [{
      id: typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 100) : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      component_name: componentName,
      condition,
      ...(sourceEngineId ? { source_engine_id: sourceEngineId } : {}),
      ...(sourceEngineName ? { source_engine_name: sourceEngineName } : {}),
      source_hours: sourceHours,
      installed_hours: installedHours,
      ...(typeof value.note === "string" && value.note.trim() ? { note: value.note.trim().slice(0, COMPONENT_TRANSFER_MAX_NOTE_LENGTH) } : {}),
    }];
  });
}

export function resolveComponentTransferEngineNames(transfers: ComponentTransfer[], engines: Engine[]): ComponentTransfer[] {
  const engineNames = new Map(engines.map((engine) => [engine._id, engine.name]));
  return transfers.flatMap((transfer) => {
    if (transfer.condition === "new") return [{ ...transfer, source_hours: 0 }];
    const sourceEngineName = transfer.source_engine_id ? engineNames.get(transfer.source_engine_id) : undefined;
    if (!sourceEngineName) return [];
    return [{ ...transfer, source_engine_name: sourceEngineName }];
  });
}

/** Parçanın belirtilen hedef motor saatindeki toplam tahmini çalışma saati. */
export function componentTotalHoursAtEngineHour(transfer: ComponentTransfer, currentEngineHours: number): number {
  return Math.max(0, transfer.source_hours) + Math.max(0, currentEngineHours - transfer.installed_hours);
}
