"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import GaugeCardList from "@/components/GaugeCardList";
import type { PanelItem, StatusKey } from "@/lib/status";
import type { MaintenanceType } from "@/lib/types";
import { ApiFetchError } from "@/lib/apiCache";
import { getMaintenancePanel } from "@/lib/maintenancePanel";
import { Button } from "@/components/ui";

const STATUS_MAP: Record<string, StatusKey> = {
  "Gecikmiş": "gecikmis", "Kritik": "kritik", "Yaklaşıyor": "yaklasiyor", "Normal": "normal",
};

export default function BakimTurleriPage() {
  const router = useRouter();
  const [items, setItems] = useState<PanelItem[]>([]);
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tümü");

  const load = useCallback(async () => {
    try {
      const data = await getMaintenancePanel();
      setItems(data.items);
      setTypes(data.types);
      setLoading(false);
      if (data.types.length) setSelectedKey([...data.types].sort((a, b) => a.label.localeCompare(b.label, "tr"))[0].key);
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
      else setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const sortedTypes = useMemo(() => [...types].sort((a, b) => a.label.localeCompare(b.label, "tr")), [types]);

  const rows = useMemo(() => {
    let list = items.filter((i) => i.type_key === selectedKey);
    if (statusFilter !== "Tümü") list = list.filter((i) => i.status === STATUS_MAP[statusFilter]);
    return [...list].sort((a, b) => a.remaining - b.remaining);
  }, [items, selectedKey, statusFilter]);

  const selectedType = types.find((t) => t.key === selectedKey);

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Türleri" subtitle="" />
        <div className="px-4 py-4">
          <div className="flex flex-wrap gap-2 mb-3">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Türleri" subtitle={selectedType ? `${selectedType.label} · ${rows.length} motor` : ""} />
      <div className="px-4 py-4">
        {/* Bakım türü çipleri */}
        <div className="flex flex-wrap gap-2 mb-3">
          {sortedTypes.map((t) => {
            const count = items.filter((i) => i.type_key === t.key).length;
            return (
              <Button
                type="button"
                key={t.key}
                onClick={() => setSelectedKey(t.key)}
                size="sm"
                className={`rounded-full px-4 ${
                  selectedKey === t.key
                    ? "bg-amber text-bg shadow-lg"
                    : "bg-panel2 text-muted border border-border hover:text-text hover:border-borderlt"
                }`}
              >
                {t.label}
                <span className={`ml-1.5 text-[10px] ${selectedKey === t.key ? "opacity-70" : "text-faint"}`}>
                  ({count})
                </span>
              </Button>
            );
          })}
        </div>

        {/* Durum çipleri */}
        <div className="flex flex-wrap gap-2 mb-4">
          {["Tümü", "Gecikmiş", "Kritik", "Yaklaşıyor", "Normal"].map((o) => (
            <button
              key={o}
              onClick={() => setStatusFilter(o)}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                statusFilter === o
                  ? "bg-teal text-bg shadow-lg"
                  : "bg-panel2 text-muted border border-border hover:text-text hover:border-borderlt"
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        {rows.length > 0 && (
          <div className="text-[11px] text-muted mb-2">
            <b className="text-text">{rows.length}</b> motor gösteriliyor
          </div>
        )}

        {rows.length === 0 ? (
          <div className="animate-fade-in rounded-card border border-border bg-panel py-12 text-center">
            <div className="mb-3 text-4xl">🔧</div>
            <p className="text-sm text-muted">Bu filtre için kayıt bulunamadı.</p>
            <Button
              type="button"
              onClick={() => setStatusFilter("Tümü")}
              variant="secondary"
              size="md"
            >
              Filtreyi Temizle
            </Button>
          </div>
        ) : (
          <div className="animate-fade-in">
            <GaugeCardList rows={rows.map((r) => ({
              key: r.engine_id,
              title: r.engine_name,
              subtitle: `Motor saati ${r.engine_hours.toLocaleString("tr-TR")} sa · Son bakım ${r.last_hour.toLocaleString("tr-TR")} sa · Çalışılan ${(r.engine_hours - r.last_hour).toLocaleString("tr-TR")} sa`,
              status: r.status, remaining: r.remaining, period: r.period,
              valueLabel: (r.remaining <= 0 ? "+" : "") + Math.abs(Math.round(r.remaining)).toLocaleString("tr-TR"),
              unitLabel: r.remaining <= 0 ? "SAAT GECİKME" : "SAAT KALDI",
              badgeName: r.engine_name,
            }))} />
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
