"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { formatDate, formatDateOnly, formatMinutes, ResultEmpty, stringValue } from "./AssistantResultPrimitives";

type Props = {
  data: Record<string, unknown>;
  intent?: string;
  expandedRecordId: string | null;
  setExpandedRecordId: Dispatch<SetStateAction<string | null>>;
  onForecastExcludedTypesChange?: (excludedTypes: string[]) => void;
};

export default function AssistantDomainResults({ data, intent, expandedRecordId, setExpandedRecordId, onForecastExcludedTypesChange }: Props) {
  const allResultItems = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  const overdueItems = intent === "overdue" ? allResultItems : [];
  const forecastItems = intent === "maintenance_forecast" ? allResultItems : [];
  const engineRows = Array.isArray(data.engines) ? data.engines as Array<Record<string, unknown>> : [];
  const performanceDaily = Array.isArray(data.performance_daily) ? data.performance_daily as Array<Record<string, unknown>> : [];
  const catalogTypes = Array.isArray(data.types) ? data.types as Array<Record<string, unknown>> : [];
  const pressureRows = Array.isArray(data.readings) ? data.readings as Array<Record<string, unknown>> : [];
  const oilRows = Array.isArray(data.analyses) ? data.analyses as Array<Record<string, unknown>> : [];
  const equipmentRows = Array.isArray(data.infos) ? data.infos as Array<Record<string, unknown>> : [];
  const directoryRows = intent === "technician_directory" && Array.isArray(data.technicians) ? data.technicians as Array<Record<string, unknown>> : [];
  const notificationRows = Array.isArray(data.notifications) ? data.notifications as Array<Record<string, unknown>> : [];
  const healthItems = intent === "maintenance_health" ? allResultItems : [];
  if (intent === "engine_data" && data.performance_mode === true) {
    const averageHours = typeof data.average_hours === "number" ? data.average_hours : null;
    const averageLoad = typeof data.average_load_kw === "number" ? data.average_load_kw : null;
    if (!performanceDaily.length) return <ResultEmpty>Seçilen dönem için motor çalışma saati ve yük geçmişi bulunamadı.</ResultEmpty>;
    return <div className="mt-3 grid min-w-0 gap-2">
      <div className="rounded-lg border border-teal/30 bg-teal/10 p-3">
        <div className="text-[9px] font-bold uppercase tracking-wide text-teal">Dönem ortalaması</div>
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <div className="rounded-md border border-teal/20 bg-panel2 px-2.5 py-2"><div className="text-[8.5px] text-faint">Ortalama motor saati</div><div className="font-mono text-[12px] font-bold text-text">{averageHours === null ? "Veri yok" : `${averageHours.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} saat`}</div></div>
          <div className="rounded-md border border-teal/20 bg-panel2 px-2.5 py-2"><div className="text-[8.5px] text-faint">Ortalama yük</div><div className="font-mono text-[12px] font-bold text-text">{averageLoad === null ? "Veri yok" : `${averageLoad.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kW`}</div></div>
          <div className="rounded-md border border-teal/20 bg-panel2 px-2.5 py-2"><div className="text-[8.5px] text-faint">Ölçüm / gün</div><div className="font-mono text-[12px] font-bold text-text">{Number(data.performance_observations || performanceDaily.length)} / {Number(data.performance_days || 0)}</div></div>
        </div>
      </div>
      <div className="min-w-0 rounded-lg border border-border bg-panel2 p-2.5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Gün gün motor performansı</div>
        <div className="grid min-w-0 gap-1.5">{performanceDaily.map((entry, index) => { const load = typeof entry.load_kw === "number" ? `${entry.load_kw.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kW` : "Yük verisi yok"; return <div key={`${String(entry.engine_id)}-${String(entry.date)}-${index}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 py-1.5 last:border-0"><div className="min-w-0"><div className="break-words text-[10.5px] font-bold text-text">{formatDateOnly(entry.date)} · {stringValue(entry.engine)}</div><div className="text-[9px] text-faint">Günlük son ölçüm · {Number(entry.measurements || 1)} kayıt</div></div><div className="flex-shrink-0 text-right font-mono text-[10px] text-muted">{Number(entry.hours || 0).toLocaleString("tr-TR")} saat · {load}</div></div>; })}</div>
      </div>
    </div>;
  }

  if (intent === "engine_data") {
    if (!engineRows.length) return <ResultEmpty>Seçilen koşullarla eşleşen motor çalışma verisi bulunamadı.</ResultEmpty>;
    return <div className="mt-3 grid gap-2 sm:grid-cols-2">{engineRows.map((engine) => { const latest = engine.latest_history && typeof engine.latest_history === "object" ? engine.latest_history as Record<string, unknown> : null; return <div key={String(engine.engine_id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(engine.engine)}</div><div className="mt-1 text-[9.5px] text-faint">Güncelleme: {formatDate(engine.updated_at)}</div></div><span className="flex-shrink-0 rounded-full bg-teal/10 px-2 py-1 font-mono text-[10px] font-bold text-teal">{Number(engine.hours || 0).toLocaleString("tr-TR")} saat</span></div><div className="mt-2 grid grid-cols-2 gap-1.5"><div className="rounded-md border border-border px-2 py-1.5"><div className="text-[8.5px] text-faint">Anlık yük</div><div className="font-mono text-[10.5px] font-bold text-text">{Number(engine.load_kw || 0).toLocaleString("tr-TR")} kW</div></div><div className="rounded-md border border-border px-2 py-1.5"><div className="text-[8.5px] text-faint">Son geçmiş kaydı</div><div className="font-mono text-[10.5px] font-bold text-text">{latest ? `${Number(latest.hours || 0).toLocaleString("tr-TR")} saat` : "—"}</div></div></div>{Array.isArray(engine.history) && engine.history.length > 0 && <div className="mt-2 border-t border-border pt-2"><div className="mb-1 text-[8.5px] font-bold uppercase tracking-wide text-faint">Dönem geçmişi</div>{engine.history.slice(-5).reverse().map((entry, index) => { const historyEntry = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; return <div key={`${String(historyEntry.date)}-${index}`} className="flex justify-between gap-2 border-b border-border/70 py-1 last:border-0 text-[9px]"><span className="text-muted">{formatDate(historyEntry.date)}</span><span className="font-mono text-text">{Number(historyEntry.hours || 0).toLocaleString("tr-TR")} sa · {Number(historyEntry.load_kw || 0).toLocaleString("tr-TR")} kW</span></div>; })}</div>}</div>; })}</div>;
  }

  if (intent === "maintenance_catalog") {
    if (!catalogTypes.length) return <ResultEmpty>Seçilen motor veya bakım türüyle eşleşen aktif bakım planı bulunamadı.</ResultEmpty>;
    return <div className="mt-3 grid gap-2 sm:grid-cols-2">{catalogTypes.map((type) => <div key={String(type.type_key)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(type.type)}</div><div className="mt-1 text-[9.5px] text-muted">Kapsam: {type.engine_scope === "all" ? "Tüm motorlar" : "Seçili motorlar"}</div></div><span className="flex-shrink-0 font-mono text-[10.5px] font-bold text-amber">{Number(type.default_period_hours || 0).toLocaleString("tr-TR")} saat</span></div>{typeof type.selected_engine === "string" && type.selected_engine.trim().length > 0 && <div className="mt-2 text-[9.5px] text-faint">{stringValue(type.selected_engine)}: {type.applicable_to_selected_engine === true ? "uygulanabilir" : "tanımlı değil"}{type.selected_engine_state !== null && type.selected_engine_state !== undefined && typeof type.selected_engine_state === "object" ? ` · Son bakım saati: ${Number((type.selected_engine_state as Record<string, unknown>).last_maintenance_hour || 0).toLocaleString("tr-TR")}` : ""}</div>}</div>)}</div>;
  }

  if (intent === "pressure_readings") {
    if (!pressureRows.length) return <ResultEmpty>Seçilen koşullarla eşleşen karter basıncı ölçümü bulunamadı.</ResultEmpty>;
    return <div className="mt-3 grid gap-2">{pressureRows.map((reading) => <div key={String(reading.id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(reading.engine)}</div><div className="mt-0.5 text-[9.5px] text-muted">{formatDate(reading.reading_date)}</div></div><span className="flex-shrink-0 font-mono text-[11px] font-bold text-text">{reading.pressure_bar === null || reading.pressure_bar === undefined ? "—" : `${Number(reading.pressure_bar).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} bar`}</span></div><div className="mt-1 text-[9.5px] text-faint">Yük: {reading.load_kw === null || reading.load_kw === undefined ? "—" : `${Number(reading.load_kw).toLocaleString("tr-TR")} kW`} · Durum: {stringValue(reading.status, "Belirtilmemiş")}</div>{typeof reading.note === "string" && reading.note.trim() && <div className="mt-1 text-[9.5px] text-muted">Not: {reading.note}</div>}</div>)}</div>;
  }

  if (intent === "oil_analysis") {
    if (!oilRows.length) return <ResultEmpty>Seçilen koşullarla eşleşen yağ analizi bulunamadı.</ResultEmpty>;
    return <div className="mt-3 grid gap-2">{oilRows.map((analysis) => <div key={String(analysis.id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(analysis.engine)}</div><div className="mt-0.5 text-[9.5px] text-muted">{formatDate(analysis.analysis_date)}</div></div>{typeof analysis.pdf_href === "string" && analysis.pdf_href.startsWith("/") && <Link href={analysis.pdf_href} target="_blank" className="flex-shrink-0 text-[9.5px] font-bold text-amber hover:underline">PDF aç</Link>}</div>{typeof analysis.result === "string" && analysis.result.trim() && <div className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-text">{analysis.result}</div>}{typeof analysis.note === "string" && analysis.note.trim() && <div className="mt-1 text-[9.5px] text-muted">Not: {analysis.note}</div>}</div>)}</div>;
  }

  if (intent === "equipment_info") {
    if (!equipmentRows.length) return <ResultEmpty>Seçilen motorla eşleşen teknik bilgi kartı bulunamadı. Teknik kartın Motor Bilgi ekranında tanımlı olduğunu kontrol edin.</ResultEmpty>;
    const fields: Array<[string, string]> = [["Kaver", "kaver_tipi"], ["Hava filtresi", "hava_filtresi"], ["Krankcase", "krankcase"], ["Eşanjör", "esanjor_tipi"], ["Dungs", "dungs"], ["Radyatör", "radyator_tipi"], ["Not", "note"]];
    return <div className="mt-3 grid gap-2 sm:grid-cols-2">{equipmentRows.map((info) => <div key={String(info.id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="text-[11px] font-bold text-text">{stringValue(info.engine_name)}</div><div className="mt-2 grid gap-1">{fields.filter(([, key]) => info[key] !== null && info[key] !== undefined && String(info[key]).trim()).map(([label, key]) => <div key={key} className="flex items-start justify-between gap-2 border-b border-border/70 py-1 last:border-0"><span className="text-[9.5px] text-faint">{label}</span><span className="text-right text-[9.5px] text-muted">{stringValue(info[key])}</span></div>)}</div></div>)}</div>;
  }

  if (intent === "technician_directory") {
    return <div className="mt-3 grid gap-2 sm:grid-cols-2">{directoryRows.map((technician) => <div key={String(technician.id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-start justify-between gap-2"><div className="truncate text-[11px] font-bold text-text">{stringValue(technician.full_name)}</div><span className="flex-shrink-0 text-[9.5px] font-semibold text-teal">{stringValue(technician.technician_type_label)}</span></div><div className="mt-2 text-[9.5px] text-muted">{technician.can_be_responsible === true ? "Sorumlu olabilir" : "Sorumlu değil"} · {technician.can_be_support === true ? "Yardımcı olabilir" : "Yardımcı değil"}</div></div>)}</div>;
  }

  if (intent === "notification_summary") {
    const counts = data.counts && typeof data.counts === "object" ? data.counts as Record<string, unknown> : {};
    return <div className="mt-3 grid gap-2"><div className="flex flex-wrap gap-1.5">{Object.entries(counts).map(([key, value]) => <span key={key} className="rounded-full border border-border bg-panel2 px-2 py-1 text-[9.5px] text-muted">{key}: <b className="font-mono text-text">{Number(value || 0)}</b></span>)}</div>{notificationRows.slice(0, 12).map((notification) => <div key={String(notification.id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-start justify-between gap-2"><div className="text-[10.5px] font-bold text-text">{stringValue(notification.title)}</div><span className="flex-shrink-0 text-[9px] text-faint">{formatDate(notification.created_at)}</span></div><div className="mt-1 text-[9.5px] leading-4 text-muted">{stringValue(notification.message)}</div>{typeof notification.href === "string" && notification.href.startsWith("/") && <Link href={notification.href} className="mt-1 inline-flex text-[9px] font-bold text-amber hover:underline">Aç →</Link>}</div>)}</div>;
  }

  if (intent === "maintenance_health") {
    const counts = data.counts && typeof data.counts === "object" ? data.counts as Record<string, unknown> : {};
    const statusLabels: Record<string, string> = { gecikmis: "Gecikmiş", kritik: "Kritik", yaklasiyor: "Yaklaşıyor", normal: "Normal" };
    const healthLimit = data.show_all === true ? 500 : 40;
    const healthHasMore = data.has_more === true;
    return <div className="mt-3 grid gap-2"><div className="flex flex-wrap gap-1.5">{Object.entries(statusLabels).map(([key, label]) => <span key={key} className="rounded-full border border-border bg-panel2 px-2 py-1 text-[9.5px] text-muted">{label}: <b className="font-mono text-text">{Number(counts[key] || 0)}</b></span>)}</div>{healthHasMore && <div className="rounded-lg border border-amber/25 bg-amber/5 px-2.5 py-2 text-[10px] text-muted">Toplam {Number(data.total_items || healthItems.length).toLocaleString("tr-TR")} motor-bakım durumu bulundu; güvenli üst sınır nedeniyle ilk {healthLimit} satır gösteriliyor.</div>}<div className="grid gap-1.5">{healthItems.slice(0, healthLimit).map((item) => { const remaining = Number(item.remaining_hours || 0); const worked = Number(item.worked_duration_minutes || 0); const lastWorked = Number(item.last_worked_duration_minutes || 0); return <div key={`${String(item.engine_id)}-${String(item.type_key)}`} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-panel2 px-2.5 py-2"><div className="min-w-0"><div className="truncate text-[10.5px] font-bold text-text">{stringValue(item.engine)} · {stringValue(item.type)}</div><div className="mt-0.5 text-[9px] text-faint">Motor saati: {Number(item.engine_hours || 0).toLocaleString("tr-TR")} · Son bakım: {Number(item.last_hour || 0).toLocaleString("tr-TR")} · Periyot: {Number(item.period_hours || 0).toLocaleString("tr-TR")} saat</div><div className="mt-1 text-[9.5px] text-muted">Son bakımdan beri motor çalışması: <span className="font-mono text-text">{Number(item.worked_since_last_hours || 0).toLocaleString("tr-TR")} saat</span></div><div className="mt-0.5 text-[9.5px] text-muted">Bakımda çalışılan ekip süresi: <span className="font-mono text-text">{formatMinutes(worked)}</span> · Son bakım işi: <span className="font-mono text-text">{formatMinutes(lastWorked)}</span> · Tamamlanan: <span className="font-mono text-text">{Number(item.completed_count || 0)}</span></div></div><span className={`flex-shrink-0 text-right font-mono text-[10px] font-bold ${remaining < 0 ? "text-red" : item.status === "kritik" ? "text-amber" : item.status === "yaklasiyor" ? "text-yellow-300" : "text-green"}`}>{remaining < 0 ? `${Math.abs(remaining).toLocaleString("tr-TR")} saat gecikmiş` : `${remaining.toLocaleString("tr-TR")} saat kaldı`}</span></div>; })}</div>{healthItems.length === 0 && <ResultEmpty>Seçilen motor, bakım türü veya durumla eşleşen bakım sağlığı kaydı bulunamadı.</ResultEmpty>}</div>
  }

  if (intent === "maintenance_forecast") {
    const targetYear = Number(data.target_year || 0);
    const filters = data.filters && typeof data.filters === "object" ? data.filters as Record<string, unknown> : {};
    const periodHours = typeof filters.maintenance_period_hours === "number" ? filters.maintenance_period_hours : 0;
    const forecastTypeOptions = [...new Set(forecastItems.map((item) => stringValue(item.type, "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    const excludedTypeLabels = Array.isArray(data.excluded_type_labels) ? data.excluded_type_labels.filter((value): value is string => typeof value === "string") : [];
    const visibleForecasts = forecastItems.filter((item) => !excludedTypeLabels.some((excluded) => excluded.localeCompare(stringValue(item.type, ""), "tr", { sensitivity: "base" }) === 0));
    const visibleOverdueCount = visibleForecasts.filter((item) => String(item.category) === "overdue").length;
    const visibleScheduledCount = visibleForecasts.length - visibleOverdueCount;
    const visibleTargetYearCount = targetYear > 0 ? visibleForecasts.filter((item) => Number(item.forecast_year) === targetYear).length : 0;
    const visibleBeforeTargetYearCount = targetYear > 0 ? visibleForecasts.filter((item) => String(item.category) === "before_target_year").length : 0;
    const visiblePeriodGroups = Object.values(visibleForecasts.reduce<Record<string, { period_hours: number; count: number }>>((groups, item) => {
      const key = String(item.period_hours);
      groups[key] = groups[key] || { period_hours: Number(item.period_hours || 0), count: 0 };
      groups[key].count += 1;
      return groups;
    }, {})).sort((a, b) => a.period_hours - b.period_hours);
    return <div className="mt-3 grid gap-2">
      <div className={`grid grid-cols-2 gap-1.5 ${targetYear > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div className="rounded-lg border border-red/25 bg-red/5 px-2.5 py-2"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Tamamlanmamış</div><div className="mt-1 font-mono text-base font-bold text-red">{visibleOverdueCount}</div></div>
        {targetYear > 0 ? <>
          <div className="rounded-lg border border-amber/25 bg-amber/5 px-2.5 py-2"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Hedef yıl</div><div className="mt-1 font-mono text-base font-bold text-amber">{visibleTargetYearCount}</div></div>
          <div className="rounded-lg border border-teal/25 bg-teal/5 px-2.5 py-2"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Öncesi</div><div className="mt-1 font-mono text-base font-bold text-teal">{visibleBeforeTargetYearCount}</div></div>
          <div className="rounded-lg border border-border bg-panel2 px-2.5 py-2"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Aktif plan</div><div className="mt-1 font-mono text-base font-bold text-text">{visibleScheduledCount}</div></div>
        </> : <>
          <div className="rounded-lg border border-amber/25 bg-amber/5 px-2.5 py-2"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">{periodHours ? `${periodHours.toLocaleString("tr-TR")} saatlik toplam` : "Toplam plan"}</div><div className="mt-1 font-mono text-base font-bold text-amber">{visibleForecasts.length}</div></div>
          <div className="rounded-lg border border-border bg-panel2 px-2.5 py-2"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Aktif tahmin</div><div className="mt-1 font-mono text-base font-bold text-text">{visibleScheduledCount}</div></div>
        </>}
      </div>
      {visiblePeriodGroups.length > 0 && <div className="flex flex-wrap gap-1.5"><span className="self-center text-[9px] font-bold uppercase tracking-wide text-faint">Periyotlar:</span>{visiblePeriodGroups.map((group) => <span key={String(group.period_hours)} className="rounded-full border border-border bg-panel2 px-2 py-1 text-[9px] text-muted">{Number(group.period_hours || 0).toLocaleString("tr-TR")} saat · {Number(group.count || 0)} bakım</span>)}</div>}
      {forecastTypeOptions.length > 0 && onForecastExcludedTypesChange && <div className="rounded-lg border border-border bg-panel2 px-2.5 py-2"><div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-faint">Rapor dışında bırakılacak bakım türleri</div><div className="flex flex-wrap gap-x-3 gap-y-1.5">{forecastTypeOptions.map((type) => <label key={type} className="flex items-center gap-1.5 text-[10px] text-muted"><input type="checkbox" checked={excludedTypeLabels.some((excluded) => excluded.localeCompare(type, "tr", { sensitivity: "base" }) === 0)} onChange={(event) => { const next = event.target.checked ? [...excludedTypeLabels, type] : excludedTypeLabels.filter((excluded) => excluded.localeCompare(type, "tr", { sensitivity: "base" }) !== 0); onForecastExcludedTypesChange([...new Set(next)]); }} />{type}</label>)}</div><div className="mt-1.5 text-[9px] text-faint">Seçtiğin türler hem ekrandaki listeden hem de indirilen PDF/Excel raporundan çıkarılır.</div></div>}
      <div className="rounded-lg border border-border bg-panel2 px-2.5 py-2 text-[9.5px] leading-4 text-faint">Tahmin, mevcut motor saati ve bakım periyoduna göre yapılır. Uygulamadaki varsayım: motor günde 24 saat çalışır; gerçek çalışma planı değişirse tarih de değişir. Gecikmiş kayıtlar hedef yıldan bağımsız olarak listenin başında tutulur.</div>
      {visibleForecasts.length === 0 && <div className="rounded-lg border border-border bg-panel2 px-2.5 py-2 text-[10px] text-muted">Seçilen filtrelerle gösterilecek tahmini bakım bulunamadı.</div>}
      <div className="grid gap-1.5">{visibleForecasts.map((item) => {
        const category = String(item.category || "target_year");
        const overdue = category === "overdue";
        const beforeTarget = category === "before_target_year";
        const borderClass = overdue ? "border-red/25 bg-red/5" : beforeTarget ? "border-teal/25 bg-teal/5" : "border-border bg-panel2";
        const dateText = overdue ? `${Number(item.overdue_hours || 0).toLocaleString("tr-TR")} saat gecikmiş` : `${stringValue(item.estimated_date_label)} tahmini`;
        return <div key={`${String(item.engine_id)}-${String(item.type_key)}`} className={`rounded-lg border p-2.5 ${borderClass}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(item.engine)}</div><div className="mt-0.5 truncate text-[10px] text-muted">{stringValue(item.type)} · {Number(item.period_hours || 0).toLocaleString("tr-TR")} saatlik bakım</div></div><span className={`flex-shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${overdue ? "bg-red/10 text-red" : beforeTarget ? "bg-teal/10 text-teal" : "bg-amber/10 text-amber"}`}>{overdue ? "Tamamlanmamış" : beforeTarget ? "Hedef yıldan önce" : `${Number(item.forecast_year || targetYear).toLocaleString("tr-TR")} planı`}</span></div><div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[9.5px] text-faint"><span>Motor saati: {Number(item.current_hours || 0).toLocaleString("tr-TR")} · Son bakım: {Number(item.last_maintenance_hours || 0).toLocaleString("tr-TR")} · Kalan: {Number(item.remaining_hours || 0).toLocaleString("tr-TR")} saat · Durum: {stringValue(item.status_label)}</span><span className={overdue ? "font-bold text-red" : "font-bold text-amber"}>{dateText}</span></div></div>;
      })}</div>
    </div>;
  }

  if (overdueItems.length > 0) {
    const overdueTotal = Number(data.count || overdueItems.length);
    const overdueDisplayed = Number(data.displayed_count || overdueItems.length);
    return <div className="mt-3 grid gap-2">{overdueTotal > overdueDisplayed && <div className="rounded-lg border border-amber/25 bg-amber/5 px-2.5 py-2 text-[10px] text-muted">Toplam {overdueTotal} gecikmiş bakım bulundu; en acil {overdueDisplayed} kayıt gösteriliyor.</div>}{overdueItems.map((item) => { const itemId = `${String(item.engine_id)}-${String(item.type_key)}`; const expanded = expandedRecordId === `status-${itemId}`; return <div key={itemId} className="rounded-lg border border-red/25 bg-red/5 p-2.5"><button type="button" onClick={() => setExpandedRecordId(expanded ? null : `status-${itemId}`)} aria-expanded={expanded} className="w-full text-left"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(item.engine)}</div><div className="mt-0.5 truncate text-[10px] text-muted">{stringValue(item.type)}</div></div><span className="flex-shrink-0 rounded-full bg-red/10 px-2 py-1 text-[9px] font-bold text-red">{Number(item.overdue_hours || 0).toLocaleString("tr-TR")} sa gecikme · {expanded ? "kapat ↑" : "detay →"}</span></div></button>{expanded && <div className="mt-2 grid gap-1 border-t border-red/20 pt-2 text-[9.5px] text-muted"><div>Motor saati: <span className="font-mono text-text">{Number(item.engine_hours || 0).toLocaleString("tr-TR")}</span> · Son bakım: <span className="font-mono text-text">{Number(item.last_hour || 0).toLocaleString("tr-TR")}</span></div><div>Periyot: <span className="font-mono text-text">{Number(item.period_hours || 0).toLocaleString("tr-TR")} saat</span> · Kalan: <span className="font-mono font-bold text-red">{Number(item.remaining_hours || 0).toLocaleString("tr-TR")} saat</span></div></div>}</div>; })}</div>;
  }

  if (intent === "overdue") return <ResultEmpty>Şu anda eşleşen gecikmiş bakım bulunamadı.</ResultEmpty>;

  return null;
}
