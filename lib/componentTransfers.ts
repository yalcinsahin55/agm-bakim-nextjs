import type { ComponentTransfer, Engine } from "@/lib/types";

export const COMPONENT_TRANSFER_MAX_COUNT = 20;
export const COMPONENT_TRANSFER_MAX_NAME_LENGTH = 120;
export const COMPONENT_TRANSFER_MAX_NOTE_LENGTH = 500;

export interface ComponentTransferDraft {
  id: string;
  component_name: string;
  source_engine_id: string;
  source_hours: string | number;
  installed_hours: string | number;
  note: string;
}

export function createComponentTransferDraft(): ComponentTransferDraft {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    component_name: "",
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
    const componentName = typeof value.component_name === "string" ? value.component_name.trim().slice(0, COMPONENT_TRANSFER_MAX_NAME_LENGTH) : "";
    const sourceEngineId = typeof value.source_engine_id === "string" ? value.source_engine_id.trim().slice(0, 100) : "";
    const sourceEngineName = typeof value.source_engine_name === "string" ? value.source_engine_name.trim().slice(0, 120) : "";
    const sourceHours = Number(value.source_hours);
    const installedHours = Number(value.installed_hours);
    if (!componentName || !sourceEngineId || !sourceEngineName || !Number.isFinite(sourceHours) || sourceHours < 0 || !Number.isFinite(installedHours) || installedHours < 0) return [];
    return [{
      id: typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 100) : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      component_name: componentName,
      source_engine_id: sourceEngineId,
      source_engine_name: sourceEngineName,
      source_hours: sourceHours,
      installed_hours: installedHours,
      ...(typeof value.note === "string" && value.note.trim() ? { note: value.note.trim().slice(0, COMPONENT_TRANSFER_MAX_NOTE_LENGTH) } : {}),
    }];
  });
}

export function resolveComponentTransferEngineNames(transfers: ComponentTransfer[], engines: Engine[]): ComponentTransfer[] {
  const engineNames = new Map(engines.map((engine) => [engine._id, engine.name]));
  return transfers.flatMap((transfer) => {
    const sourceEngineName = engineNames.get(transfer.source_engine_id);
    if (!sourceEngineName) return [];
    return [{ ...transfer, source_engine_name: sourceEngineName }];
  });
}
