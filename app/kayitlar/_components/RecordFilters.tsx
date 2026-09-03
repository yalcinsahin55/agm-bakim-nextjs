"use client";

import type { Dispatch, SetStateAction } from "react";
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
  userRole,
  search,
  setSearch,
  engineFilter,
  setEngineFilter,
  typeFilter,
  setTypeFilter,
  sortedEngines,
  typeLabels,
  confirmationFilter,
  setConfirmationFilter,
  onReset,
}: RecordFiltersProps) {
  const hasActiveFilter = Boolean(search) || engineFilter !== "Tümü" || typeFilter !== "Tümü" || confirmationFilter !== "all";

  return (
    <>
      <div className="mb-4 rounded-card border border-border bg-panel p-3 shadow-sm shadow-black/10">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm" aria-hidden="true">🔍</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Motor, tür veya teknisyen ara..."
            aria-label="Bakım kaydı ara"
            className="w-full min-w-0 bg-panel2 border border-border rounded-xl pl-9 pr-3 py-2.5 text-[12px] outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
          <select
            value={engineFilter}
            onChange={(event) => setEngineFilter(event.target.value)}
            aria-label="Motor filtresi"
            className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px] outline-none focus:border-teal transition"
          >
            <option value="Tümü">Tüm Motorlar</option>
            {sortedEngines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="Bakım türü filtresi"
            className="min-w-0 bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px] outline-none focus:border-teal transition"
          >
            <option value="Tümü">Tüm Türler</option>
            {typeLabels.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>
      </div>

      {userRole === "yonetici" && <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirmationFilter((current) => current === "pending" ? "all" : "pending")}
          className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition ${confirmationFilter === "pending" ? "border-amber/60 bg-amber/15 text-amber" : "border-border bg-panel2 text-muted hover:border-amber/50 hover:text-amber"}`}
        >
          {confirmationFilter === "pending" ? "✓ Teyit kuyruğu açık" : "Teyit bekleyenleri göster"}
        </button>
        {confirmationFilter === "pending" && <span className="text-[10px] text-faint">Yalnızca yönetici incelemesi bekleyen yeni kayıtlar</span>}
      </div>}

      {hasActiveFilter && <button type="button" onClick={onReset} className="sr-only">Filtreleri temizle</button>}
    </>
  );
}
