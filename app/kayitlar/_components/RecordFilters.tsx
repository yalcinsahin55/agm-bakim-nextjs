"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { Engine } from "../_types";

interface RecordFiltersProps {
  userRole?: string;
  search: string;
  setSearch: (value: string) => void;
  engineFilter: string;
  setEngineFilter: (value: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  sortedEngines: Engine[];
  typeLabels: string[];
  confirmationFilter: "all" | "pending";
  setConfirmationFilter: Dispatch<SetStateAction<"all" | "pending">>;
  onReset: () => void;
}

export default function RecordFilters({
  userRole, search, setSearch, engineFilter, setEngineFilter, typeFilter, setTypeFilter,
  sortedEngines, typeLabels, confirmationFilter, setConfirmationFilter, onReset,
}: RecordFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasActiveFilter = Boolean(search) || engineFilter !== "Tümü" || typeFilter !== "Tümü" || confirmationFilter !== "all";
  const activeFilterCount = [Boolean(search), engineFilter !== "Tümü", typeFilter !== "Tümü", confirmationFilter !== "all"].filter(Boolean).length;
  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <div className="mb-4 rounded-card border border-border bg-panel p-3 shadow-sm shadow-black/10">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint" aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Motor, tür veya teknisyen ara..." aria-label="Bakım kaydı ara" className="ui-control min-h-11 w-full min-w-0 pl-9 pr-3 text-[12px]" />
          </div>
          <button type="button" onClick={() => setMobileOpen(true)} className="ui-button ui-button-secondary relative min-h-11 shrink-0 px-3 text-[11px] sm:hidden" aria-label="Filtreleri aç">
            Filtrele{activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 text-[9px] text-on-amber">{activeFilterCount}</span>}
          </button>
        </div>
        <div className={`${mobileOpen ? "fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-border bg-panel p-3 shadow-2xl" : "hidden"} mt-2 grid grid-cols-1 gap-2 sm:static sm:grid sm:grid-cols-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none lg:grid-cols-[1.4fr_1fr_1fr_auto]`}>
          <div className="mb-1 flex items-center justify-between sm:hidden">
            <div className="text-xs font-extrabold text-text">Filtreler</div>
            <button type="button" onClick={closeMobile} className="rounded-lg px-2 py-1 text-lg text-muted" aria-label="Filtreleri kapat">×</button>
          </div>
          <select value={engineFilter} onChange={(event) => setEngineFilter(event.target.value)} aria-label="Motor filtresi" className="ui-control min-h-11 px-2.5 text-[12.5px]">
            <option value="Tümü">Tüm Motorlar</option>
            {sortedEngines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Bakım türü filtresi" className="ui-control min-h-11 min-w-0 px-2.5 text-[12.5px]">
            <option value="Tümü">Tüm Türler</option>
            {typeLabels.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <button type="button" onClick={onReset} className="ui-button ui-button-secondary flex-1 text-[11px]">Temizle</button>
            <button type="button" onClick={closeMobile} className="ui-button ui-button-primary flex-1 text-[11px] sm:hidden">Uygula</button>
          </div>
        </div>
      </div>

      {userRole === "yonetici" && <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => setConfirmationFilter((current) => current === "pending" ? "all" : "pending")} className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition ${confirmationFilter === "pending" ? "border-amber/60 bg-amber/15 text-amber" : "border-border bg-panel2 text-muted hover:border-amber/50 hover:text-amber"}`}>
          {confirmationFilter === "pending" ? "✓ Teyit kuyruğu açık" : "Teyit bekleyenleri göster"}
        </button>
        {confirmationFilter === "pending" && <span className="text-[10px] text-faint">Yalnızca yönetici incelemesi bekleyen yeni kayıtlar</span>}
      </div>}

      {hasActiveFilter && <button type="button" onClick={onReset} className="sr-only">Filtreleri temizle</button>}
    </>
  );
}
