"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { engineSortKey } from "@/lib/status";
import type { Engine, MaintenanceRecord, MaintenanceType } from "../_types";
import { maintenanceDayKey, maintenanceDayLabel } from "../_lib/recordDisplay";

interface RecordsPageUser { role?: string; }
interface TechnicianReference { id: string; full_name: string; }

export function useRecordsPageData(user: RecordsPageUser | null | undefined) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestControllerRef = useRef<AbortController | null>(null);
  const referenceDataLoadedRef = useRef(false);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianReference[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [mediaLoadingId, setMediaLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [engineFilter, setEngineFilter] = useState("Tümü");
  const [typeFilter, setTypeFilter] = useState("Tümü");
  const [search, setSearch] = useState("");
  const [confirmationFilter, setConfirmationFilter] = useState<"all" | "pending">("all");
  const [technicianFilter, setTechnicianFilter] = useState("Tümü");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async (requestedPage = 1) => {
    requestControllerRef.current?.abort();
    const requestController = new AbortController();
    requestControllerRef.current = requestController;
    const params = new URLSearchParams({ page: String(requestedPage), page_size: "25" });
    if (engineFilter !== "Tümü") params.set("engine_id", engineFilter);
    if (typeFilter !== "Tümü") params.set("type_label", typeFilter);
    if (search.trim()) params.set("search", search.trim());
    if (user?.role === "yonetici" && confirmationFilter !== "all") params.set("confirmation_status", confirmationFilter);
    if (technicianFilter !== "Tümü") params.set("technician_id", technicianFilter);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const requests: Promise<Response>[] = [fetch(`/api/records?${params}`, { signal: requestController.signal })];
    if (!referenceDataLoadedRef.current) {
      requests.push(fetch("/api/engines", { signal: requestController.signal }), fetch("/api/maintenance-types", { signal: requestController.signal }), fetch("/api/users/technicians", { signal: requestController.signal }));
    }
    try {
      const [recRes, engRes, typeRes, techRes] = await Promise.all(requests);
      if (recRes.status === 401) { router.push("/login"); return; }
      const recordData = await recRes.json();
      if (requestController.signal.aborted) return;
      setRecords(recordData.records || []);
      setTotal(recordData.total || 0);
      setPage(recordData.page || requestedPage);
      setTotalPages(recordData.totalPages || 1);
      if (engRes && typeRes && techRes) {
        setEngines(await engRes.json());
        setTypes(await typeRes.json());
        setTechnicians(await techRes.json());
        referenceDataLoadedRef.current = true;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    } finally {
      if (requestControllerRef.current === requestController) {
        requestControllerRef.current = null;
        if (!requestController.signal.aborted) setLoading(false);
      }
    }
  }, [confirmationFilter, engineFilter, fromDate, router, search, technicianFilter, toDate, typeFilter, user?.role]);

  useEffect(() => {
    const value = (key: string) => searchParams.get(key) || "";
    setSearch(value("search"));
    setEngineFilter(searchParams.get("engine_id") || "Tümü");
    setTypeFilter(searchParams.get("type_label") || "Tümü");
    setTechnicianFilter(searchParams.get("technician_id") || "Tümü");
    setFromDate(value("from_date"));
    setToDate(value("to_date"));
    setConfirmationFilter(searchParams.get("confirmation_status") === "pending" ? "pending" : "all");
  }, [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("search", search.trim());
    if (engineFilter !== "Tümü") next.set("engine_id", engineFilter);
    if (typeFilter !== "Tümü") next.set("type_label", typeFilter);
    if (technicianFilter !== "Tümü") next.set("technician_id", technicianFilter);
    if (fromDate) next.set("from_date", fromDate);
    if (toDate) next.set("to_date", toDate);
    if (confirmationFilter !== "all") next.set("confirmation_status", confirmationFilter);
    const query = next.toString();
    if (query !== searchParams.toString()) router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [confirmationFilter, engineFilter, fromDate, pathname, router, search, searchParams, technicianFilter, toDate, typeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), search.trim() ? 300 : 0);
    return () => { window.clearTimeout(timer); requestControllerRef.current?.abort(); };
  }, [load, search]);
  useEffect(() => () => { requestControllerRef.current?.abort(); requestControllerRef.current = null; }, []);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const typeLabels = useMemo(() => [...types].map((type) => type.label).sort((a, b) => a.localeCompare(b, "tr")), [types]);
  const recordGroups = useMemo(() => {
    const groups = new Map<string, MaintenanceRecord[]>();
    records.forEach((record) => { const key = maintenanceDayKey(record); groups.set(key, [...(groups.get(key) || []), record]); });
    return [...groups.entries()].map(([key, groupRecords]) => ({ key, label: maintenanceDayLabel(key), records: groupRecords }));
  }, [records]);

  return { engines, sortedEngines, types, typeLabels, technicians, records, setRecords, total, page, totalPages, loading, engineFilter, setEngineFilter, typeFilter, setTypeFilter, search, setSearch, confirmationFilter, setConfirmationFilter, technicianFilter, setTechnicianFilter, fromDate, setFromDate, toDate, setToDate, mediaLoadingId, setMediaLoadingId, recordGroups, load };
}
