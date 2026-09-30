"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CompletionDraft {
  savedAt: string;
  engineId: string;
  typeKey: string;
  hours: number;
  maintenanceStartAt: string;
  maintenanceEndAt: string;
  pressure: string;
  techNote: string;
  extraKeys: string[];
  extraPeriods: Record<string, number>;
  responsibleTechnicianId: string;
  responsibleTechnicianDurationMinutes: number | null;
  otherTechnicianIds: string[];
  otherTechnicianDurations: Record<string, number>;
  technicianSource: "internal" | "external_service";
  externalServiceName: string;
  checklist: Record<string, boolean>;
  previousWorkingHours: Record<string, number | string | undefined>;
}

const PREFIX = "agm-completion-draft:";

export function useCompletionDraft(key: string, value: Omit<CompletionDraft, "savedAt">) {
  const storageKey = `${PREFIX}${key}`;
  const [draft, setDraft] = useState<CompletionDraft | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setDraft(JSON.parse(raw) as CompletionDraft);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!restoredRef.current) return;
    const timer = window.setTimeout(() => {
      const hasMeaningfulContent = Boolean(value.techNote.trim() || value.maintenanceStartAt || value.maintenanceEndAt || value.extraKeys.length || value.otherTechnicianIds.length);
      if (!hasMeaningfulContent) return;
      const next: CompletionDraft = { ...value, savedAt: new Date().toISOString() };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setDraft(next);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [storageKey, value]);

  const markReady = useCallback(() => { restoredRef.current = true; }, []);
  const clearDraft = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setDraft(null);
  }, [storageKey]);
  return { draft, markReady, clearDraft };
}
