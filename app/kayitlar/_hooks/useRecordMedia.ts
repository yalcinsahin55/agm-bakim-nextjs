"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { MaintenanceRecord } from "../_types";

interface UseRecordMediaOptions {
  setRecords: Dispatch<SetStateAction<MaintenanceRecord[]>>;
}

export function useRecordMedia({ setRecords }: UseRecordMediaOptions) {
  const [mediaLoadingId, setMediaLoadingId] = useState<string | null>(null);

  const loadRecordMedia = useCallback(async (record: MaintenanceRecord): Promise<MaintenanceRecord | null> => {
    if (record.videos !== undefined && (record.photos !== undefined || record.photos_b64 !== undefined)) return record;
    setMediaLoadingId(record._id);
    try {
      const res = await fetch(`/api/records/${record._id}?include_media=true`);
      if (!res.ok) throw new Error("Medya yüklenemedi");
      const detail = await res.json() as MaintenanceRecord;
      setRecords((current) => current.map((item) => item._id === record._id ? detail : item));
      return detail;
    } catch {
      toast.error("Kayıt detayları yüklenemedi.");
      return null;
    } finally {
      setMediaLoadingId(null);
    }
  }, [setRecords]);

  return { loadRecordMedia, mediaLoadingId };
}
