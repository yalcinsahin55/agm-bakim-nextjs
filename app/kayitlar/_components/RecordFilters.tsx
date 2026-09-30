"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { Engine } from "../_types";

interface Technician { id: string; full_name: string; }
interface RecordFiltersProps {
  userRole?: string; search: string; setSearch: (value: string) => void;
  engineFilter: string; setEngineFilter: (value: string) => void;
  typeFilter: string; setTypeFilter: (value: string) => void;
  sortedEngines: Engine[]; typeLabels: string[];
  confirmationFilter: "all" | "pending"; setConfirmationFilter: Dispatch<SetStateAction<"all" | "pending">>;
  technicianFilter: string; setTechnicianFilter: (value: string) => void; technicians: Technician[];
  fromDate: string; setFromDate: (value: string) => void; toDate: string; setToDate: (value: string) => void;
  onReset: () => void;
}

export default function RecordFilters({ userRole, search, setSearch, engineFilter, setEngineFilter, typeFilter, setTypeFilter, sortedEngines, typeLabels, confirmationFilter, setConfirmationFilter, technicianFilter, setTechnicianFilter, technicians, fromDate, setFromDate, toDate, setToDate, onReset }: RecordFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasActiveFilter = Boolean(search) || engineFilter !== "Tümü" || typeFilter !== "Tümü" || confirmationFilter !== "all" || technicianFilter !== "Tümü" || Boolean(fromDate) || Boolean(toDate);
  const activeFilterCount = [Boolean(search), engineFilter !== "Tümü", typeFilter !== "Tümü", confirmationFilter !== "all", technicianFilter !== "Tümü", Boolean(fromDate || toDate)].filter(Boolean).length;
  const closeMobile = () => setMobileOpen(false);
  const controls = (
    <>
      <select value={engineFilter} onChange={(event) => setEngineFilter(event.target.value)} aria-label="Motor filtresi" className="ui-control min-h-11 px-2.5 text-[12.5px]"><option value="Tümü">Tüm Motorlar</option>{sortedEngines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}</select>
      <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Bakım türü filtresi" className="ui-control min-h-11 min-w-0 px-2.5 text-[12.5px]"><option value="Tümü">Tüm Türler</option>{typeLabels.map((label) => <option key={label} value={label}>{label}</option>)}</select>
      <select value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)} aria-label="Teknisyen filtresi" className="ui-control min-h-11 min-w-0 px-2.5 text-[12.5px]"><option value="Tümü">Tüm Teknisyenler</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.full_name}</option>)}</select>
      <label className="flex min-w-0 flex-col justify-center text-[9px] font-bold text-faint">Başlangıç tarihi<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="ui-control mt-1 min-h-10 px-2 text-[11px] text-text" /></label>
      <label className="flex min-w-0 flex-col justify-center text-[9px] font-bold text-faint">Bitiş tarihi<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="ui-control mt-1 min-h-10 px-2 text-[11px] text-text" /></label>
      {userRole === "yonetici" && <button type="button" onClick={() => setConfirmationFilter((current) => current === "pending" ? "all" : "pending")} className={`min-h-11 rounded-xl border px-3 text-[11px] font-bold transition ${confirmationFilter === "pending" ? "border-amber/60 bg-amber/15 text-amber" : "border-border bg-panel2 text-muted hover:border-amber/50 hover:text-amber"}`}>{confirmationFilter === "pending" ? "✓ Teyit kuyruğu" : "Teyit bekleyenler"}</button>}
    </>
  );
  return <>
    <div className="mb-4 rounded-card border border-border bg-panel p-3 shadow-sm shadow-black/10">
      <div className="flex gap-2"><div className="relative min-w-0 flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint" aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Motor, tür veya teknisyen ara..." aria-label="Bakım kaydı ara" className="ui-control min-h-11 w-full min-w-0 pl-9 pr-3 text-[12px]" /></div><button type="button" onClick={() => setMobileOpen(true)} className="ui-button ui-button-secondary relative min-h-11 shrink-0 px-3 text-[11px] sm:hidden" aria-label="Gelişmiş filtreleri aç">Filtrele{activeFilterCount > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 text-[9px] text-on-amber">{activeFilterCount}</span>}</button></div>
      <div className="mt-2 hidden grid-cols-1 gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-[1.25fr_1.1fr_1.2fr_1fr_1fr_auto]">{controls}<button type="button" onClick={onReset} className="ui-button ui-button-secondary min-h-11 text-[11px]">Temizle</button></div>
      {hasActiveFilter && <div className="mt-2 text-[10px] text-muted">{activeFilterCount} aktif filtre · sonuçlar URL ile paylaşılabilir</div>}
    </div>
    {mobileOpen && <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-3 sm:hidden" role="dialog" aria-modal="true" aria-label="Gelişmiş filtreler" onClick={closeMobile}><div className="w-full rounded-2xl border border-border bg-panel p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-2 flex items-center justify-between"><div className="text-xs font-extrabold text-text">Gelişmiş filtreler</div><button type="button" onClick={closeMobile} className="rounded-lg px-2 py-1 text-lg text-muted" aria-label="Filtreleri kapat">×</button></div><div className="grid gap-2">{controls}</div><div className="mt-3 flex gap-2"><button type="button" onClick={onReset} className="ui-button ui-button-secondary flex-1">Temizle</button><button type="button" onClick={closeMobile} className="ui-button ui-button-primary flex-1">Uygula</button></div></div></div>}
    {userRole === "yonetici" && confirmationFilter === "pending" && <div className="mb-4 text-[10px] text-faint">Yalnızca yönetici incelemesi bekleyen yeni kayıtlar gösteriliyor.</div>}
  </>;
}
