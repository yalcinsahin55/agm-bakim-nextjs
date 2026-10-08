"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import GaugeCardList from "@/components/GaugeCardList";
import AppIcon from "@/components/ui/AppIcon";
import { ApiFetchError } from "@/lib/apiCache";
import { getMaintenancePanel } from "@/lib/maintenancePanel";
import { forecastDaysFromRemainingHours } from "@/lib/forecastMath";
import { STATUS_COLORS, STATUS_LABELS, type PanelItem, type StatusKey } from "@/lib/status";

const MAX_DAILY_HOURS = 24;
const INITIAL_VISIBLE_ROWS = 48;
const statusOptions: Array<{ value: "Tümü" | StatusKey; label: string }> = [
  { value: "Tümü", label: "Tüm durumlar" },
  { value: "gecikmis", label: STATUS_LABELS.gecikmis },
  { value: "kritik", label: STATUS_LABELS.kritik },
  { value: "yaklasiyor", label: STATUS_LABELS.yaklasiyor },
  { value: "normal", label: STATUS_LABELS.normal },
];
const statusCards: Array<{ value: StatusKey; label: string }> = statusOptions.filter(
  (option): option is { value: StatusKey; label: string } => option.value !== "Tümü",
);

function formatHours(value: number): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

export default function TahminPage() {
  const router = useRouter();
  const [items, setItems] = useState<PanelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("Tümü");
  const [statusFilter, setStatusFilter] = useState<"Tümü" | StatusKey>("Tümü");
  const [engineQuery, setEngineQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [targetYear, setTargetYear] = useState(String(new Date().getFullYear() + 1));
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  useEffect(() => {
    getMaintenancePanel()
      .then((data) => {
        setItems(data.items);
        setLoading(false);
      })
      .catch((error) => {
        if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
        else setLoading(false);
      });
  }, [router]);

  useEffect(() => {
    setShowAll(false);
  }, [typeFilter, statusFilter, engineQuery]);

  const typeOptions = useMemo(
    () => ["Tümü", ...Array.from(new Set(items.map((item) => item.type_label))).sort((a, b) => a.localeCompare(b, "tr"))],
    [items],
  );

  const counts = useMemo(() => items.reduce<Record<StatusKey, number>>((result, item) => {
    result[item.status] += 1;
    return result;
  }, { gecikmis: 0, kritik: 0, yaklasiyor: 0, normal: 0 }), [items]);

  const rows = useMemo(() => {
    const normalizedEngineQuery = engineQuery.trim().toLocaleLowerCase("tr-TR");
    const filtered = items.filter((item) => {
      const matchesType = typeFilter === "Tümü" || item.type_label === typeFilter;
      const matchesStatus = statusFilter === "Tümü" || item.status === statusFilter;
      const matchesEngine = !normalizedEngineQuery || item.engine_name.toLocaleLowerCase("tr-TR").includes(normalizedEngineQuery);
      return matchesType && matchesStatus && matchesEngine;
    });

    return filtered
      .map((item) => {
        const daysLeft = item.remaining / MAX_DAILY_HOURS;
        const estimatedDate = new Date();
        estimatedDate.setDate(estimatedDate.getDate() + forecastDaysFromRemainingHours(item.remaining));
        return { ...item, daysLeft, estimatedDateLabel: estimatedDate.toLocaleDateString("tr-TR") };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft || a.engine_name.localeCompare(b.engine_name, "tr"));
  }, [items, typeFilter, statusFilter, engineQuery]);

  const visibleRows = showAll ? rows : rows.slice(0, INITIAL_VISIBLE_ROWS);
  const hasActiveFilter = typeFilter !== "Tümü" || statusFilter !== "Tümü" || engineQuery.trim().length > 0;

  const clearFilters = () => {
    setTypeFilter("Tümü");
    setStatusFilter("Tümü");
    setEngineQuery("");
  };

  async function exportForecast(kind: "excel" | "pdf"): Promise<void> {
    if (exporting) return;
    setExporting(kind);
    try {
      const params = new URLSearchParams({ forecast: "1", target_year: targetYear });
      if (typeFilter !== "Tümü") params.set("type_label", typeFilter);
      if (statusFilter !== "Tümü") params.set("status", statusFilter === "gecikmis" ? "overdue" : statusFilter === "kritik" ? "critical" : statusFilter === "yaklasiyor" ? "upcoming" : "normal");
      const response = await fetch(`/api/export/${kind}?${params.toString()}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Plan raporu hazırlanamadı.");
      const blob = await response.blob();
      const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || `AGM_Bakim_Plani_${targetYear}.${kind === "excel" ? "xlsx" : "pdf"}`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Plan raporu indirilemedi.");
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Tarihi Tahmini" />
        <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
          <Skeleton className="h-28 w-full rounded-card" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-card" />)}
          </div>
          <Skeleton className="h-24 w-full rounded-card" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-card" />)}
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Tarihi Tahmini" subtitle={`${rows.length.toLocaleString("tr-TR")} kayıt eşleşiyor`} />
      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <section className="bg-panel border border-border rounded-card p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-control bg-teal/15 text-teal flex items-center justify-center text-lg font-bold flex-shrink-0" aria-hidden="true">24</div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-teal font-bold">Planlama notu</p>
              <h1 className="text-base md:text-lg font-bold text-text mt-1">Motor saati bazlı en geç bakım tahmini</h1>
              <p className="text-xs text-muted leading-relaxed mt-1.5 max-w-3xl">
                Tahminler, motorun günde 24 saat kesintisiz çalıştığı varsayımıyla motor çalışma sayacına göre hesaplanır. Bu değer personel çalışma süresi değil, bakım planlama için kullanılan tahmini takvim bilgisidir.
              </p>
            </div>
          </div>
        </section>

        <section aria-label="Bakım durumu özeti" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statusCards.map((status) => (
            <button
              key={status.value}
              type="button"
              onClick={() => setStatusFilter(statusFilter === status.value ? "Tümü" : status.value)}
              className={`bg-panel border rounded-card p-3 text-left transition-colors ${statusFilter === status.value ? "border-amber ring-1 ring-amber/50" : "border-border hover:border-borderlt"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status.value] }} aria-hidden="true" />
                <span className="text-[10px] text-faint uppercase tracking-wide">Filtrele</span>
              </div>
              <div className="text-xl font-bold text-text mt-2">{counts[status.value].toLocaleString("tr-TR")}</div>
              <div className="text-xs text-muted mt-0.5">{status.label}</div>
            </button>
          ))}
        </section>

        <section className="bg-panel border border-border rounded-card p-3 md:p-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <label className="flex-1 min-w-0">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-faint font-bold mb-1.5">Motor ara</span>
              <input
                value={engineQuery}
                onChange={(event) => setEngineQuery(event.target.value)}
                placeholder="Örn. AGM 35"
                className="w-full h-10 rounded-lg bg-panel2 border border-border px-3 text-sm text-text placeholder:text-faint outline-none focus:border-amber"
              />
            </label>
            <label className="lg:w-56">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-faint font-bold mb-1.5">Durum</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "Tümü" | StatusKey)} className="w-full h-10 rounded-lg bg-panel2 border border-border px-3 text-sm text-text outline-none focus:border-amber">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="lg:w-64">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-faint font-bold mb-1.5">Bakım türü</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="w-full h-10 rounded-lg bg-panel2 border border-border px-3 text-sm text-text outline-none focus:border-amber">
                {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            {hasActiveFilter && (
              <button type="button" onClick={clearFilters} className="h-10 px-3 rounded-lg border border-border text-xs font-bold text-muted hover:text-text hover:border-borderlt">
                Filtreleri temizle
              </button>
            )}
          </div>
        </section>

        <section className="bg-panel border border-amber/30 rounded-card p-3 md:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber font-bold">İleriye dönük plan çıktısı</p>
              <h2 className="text-sm font-bold text-text mt-1">Yıllık bakım planı indir</h2>
              <p className="text-xs text-muted mt-1">Seçilen yıla kadar oluşan tahmini bakım planını Excel veya PDF olarak al.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="forecast-target-year">Plan yılı</label>
              <select id="forecast-target-year" value={targetYear} onChange={(event) => setTargetYear(event.target.value)} className="h-10 rounded-control border border-border bg-panel2 px-3 text-sm text-text">
                {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() + index + 1).map((year) => <option key={year} value={year}>{year} planı</option>)}
              </select>
              <button type="button" onClick={() => void exportForecast("excel")} disabled={Boolean(exporting)} className="inline-flex h-10 items-center justify-center gap-2 rounded-control bg-teal px-3 text-xs font-bold text-on-teal disabled:opacity-60"><AppIcon name="file" size={15} />{exporting === "excel" ? "Hazırlanıyor..." : "Excel indir"}</button>
              <button type="button" onClick={() => void exportForecast("pdf")} disabled={Boolean(exporting)} className="inline-flex h-10 items-center justify-center gap-2 rounded-control bg-amber px-3 text-xs font-bold text-on-amber disabled:opacity-60"><AppIcon name="file" size={15} />{exporting === "pdf" ? "Hazırlanıyor..." : "PDF indir"}</button>
            </div>
          </div>
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-amber font-bold">Bakım takvimi</p>
              <h2 className="text-lg font-bold text-text mt-1">Motor bazlı tahminler</h2>
            </div>
            <p className="text-xs text-muted">{visibleRows.length.toLocaleString("tr-TR")} / {rows.length.toLocaleString("tr-TR")} kayıt gösteriliyor</p>
          </div>

          {rows.length === 0 ? (
            <div className="text-center py-12 bg-panel border border-border rounded-card">
              <div className="w-12 h-12 mx-auto rounded-full bg-panel2 flex items-center justify-center text-amber font-bold text-xl" aria-hidden="true">—</div>
              <p className="text-sm text-text font-semibold mt-3">Bu filtrelerle eşleşen tahmin yok.</p>
              <p className="text-xs text-muted mt-1">Tüm bakım planlarını görmek için filtreleri temizleyebilirsin.</p>
              {hasActiveFilter && <button type="button" onClick={clearFilters} className="mt-4 px-4 py-2 rounded-lg bg-amber text-on-amber text-xs font-bold">Filtreleri temizle</button>}
            </div>
          ) : (
            <>
              <GaugeCardList rows={visibleRows.map((item) => ({
                key: `${item.engine_id}:${item.type_key}`,
                title: item.engine_name,
                subtitle: `${item.type_label} · Motor saati ${formatHours(item.engine_hours)} · Periyot ${formatHours(item.period)} sa · Kalan ${formatHours(Math.max(0, item.remaining))} sa`,
                status: item.status,
                remaining: item.remaining,
                period: item.period,
                valueLabel: item.estimatedDateLabel,
                unitLabel: "EN GEÇ BAKIM TARİHİ",
                badgeName: item.engine_name,
              }))} />
              {rows.length > INITIAL_VISIBLE_ROWS && (
                <div className="flex justify-center mt-4">
                  <button type="button" onClick={() => setShowAll((current) => !current)} className="px-5 py-2.5 rounded-lg border border-border bg-panel text-sm font-bold text-text hover:border-amber">
                    {showAll ? "Daha az göster" : `Kalan ${(rows.length - INITIAL_VISIBLE_ROWS).toLocaleString("tr-TR")} kaydı göster`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
