"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
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
      <Card className="mb-3 p-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-faint" aria-hidden="true">🔍</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Motor, tür veya teknisyen ara..."
            aria-label="Bakım kaydı ara"
            className="rounded-xl pl-9"
          />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select value={engineFilter} onChange={(event) => setEngineFilter(event.target.value)} aria-label="Motor filtresi" className="rounded-xl px-2.5 text-[12.5px]">
            <option value="Tümü">Tüm Motorlar</option>
            {sortedEngines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
          </Select>
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Bakım türü filtresi" className="min-w-0 rounded-xl px-2.5 text-[12.5px]">
            <option value="Tümü">Tüm Türler</option>
            {typeLabels.map((label) => <option key={label} value={label}>{label}</option>)}
          </Select>
        </div>
      </Card>

      {userRole === "yonetici" && <div className="mb-4 flex items-center gap-2">
        <Button
          type="button"
          onClick={() => setConfirmationFilter((current) => current === "pending" ? "all" : "pending")}
          variant="secondary"
          size="sm"
          className={`rounded-xl ${confirmationFilter === "pending" ? "border-amber/60 bg-amber/15 text-amber" : "hover:border-amber/50 hover:text-amber"}`}
        >
          {confirmationFilter === "pending" ? "✓ Teyit kuyruğu açık" : "Teyit bekleyenleri göster"}
        </Button>
        {confirmationFilter === "pending" && <span className="text-[10px] text-faint">Yalnızca yönetici incelemesi bekleyen yeni kayıtlar</span>}
      </div>}

      {hasActiveFilter && <button type="button" onClick={onReset} className="sr-only">Filtreleri temizle</button>}
    </>
  );
}
