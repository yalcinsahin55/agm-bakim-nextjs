"use client";

import { useState } from "react";
import AssistantDomainResults from "./AssistantDomainResults";
import AssistantRecordResults from "./AssistantRecordResults";
import { formatDate, formatDateOnly, formatMinutes, ResultEmpty, stringValue } from "./AssistantResultPrimitives";

const STRICT_DOMAIN_INTENTS = new Set(["engine_data", "maintenance_catalog", "pressure_readings", "oil_analysis", "equipment_info", "technician_directory", "notification_summary", "maintenance_health", "maintenance_forecast", "overdue"]);

export default function AssistantResultDetails({ data, intent, onForecastExcludedTypesChange }: { data: Record<string, unknown>; intent?: string; onForecastExcludedTypesChange?: (excludedTypes: string[]) => void }) {
  const [expandedEngineId, setExpandedEngineId] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [expandedTechnicianId, setExpandedTechnicianId] = useState<string | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const dailyMaintenanceRecords = intent === "summary" && Array.isArray(data.daily_records) ? data.daily_records as Array<Record<string, unknown>> : [];
  const technicians = Array.isArray(data.technicians) ? data.technicians as Array<Record<string, unknown>> : [];
  const services = Array.isArray(data.services) ? data.services as Array<Record<string, unknown>> : [];
  const engines = Array.isArray(data.engines) ? data.engines as Array<Record<string, unknown>> : [];
  const byEngine = Array.isArray(data.by_engine) ? data.by_engine as Array<Record<string, unknown>> : [];
  const activities = Array.isArray(data.activities) ? data.activities as Array<Record<string, unknown>> : [];
  const byType = Array.isArray(data.by_type) ? data.by_type as Array<Record<string, unknown>> : [];
  const topTechnician = data.top_technician && typeof data.top_technician === "object" ? data.top_technician as Record<string, unknown> : null;
  const technicianDetails = Array.isArray(data.technician_details) ? data.technician_details as Array<Record<string, unknown>> : [];
  const technicianDetailMap = new Map(technicianDetails.map((detail) => [String(detail.technician_id), detail]));
  const topTechnicianId = topTechnician ? String(topTechnician.id || "") : "";
  const topTechnicianDetail = topTechnicianId ? technicianDetailMap.get(topTechnicianId) : undefined;
  const topTechnicianByType = topTechnicianDetail && Array.isArray(topTechnicianDetail.by_type) ? topTechnicianDetail.by_type as Array<Record<string, unknown>> : [];
  const topTechnicianByEngine = topTechnicianDetail && Array.isArray(topTechnicianDetail.by_engine) ? topTechnicianDetail.by_engine as Array<Record<string, unknown>> : [];
  const selectedTechnician = intent === "technician_performance" && data.selected_technician && typeof data.selected_technician === "object" ? data.selected_technician as Record<string, unknown> : null;
  const selectedTechnicianSummary = selectedTechnician ? <div className="rounded-lg border border-teal/30 bg-teal/10 p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-teal">Seçilen teknisyen · çalışma özeti</div><div className="mt-1 flex min-w-0 flex-wrap items-baseline justify-between gap-2"><span className="min-w-0 flex-1 break-words text-[12px] font-extrabold text-text">{stringValue(selectedTechnician.full_name)}</span><span className="flex-shrink-0 font-mono text-[13px] font-bold text-teal">{stringValue(selectedTechnician.duration_text, formatMinutes(selectedTechnician.duration_minutes))}</span></div><div className="mt-2 grid grid-cols-2 gap-1.5 xl:grid-cols-4"><div className="rounded-md border border-teal/20 bg-panel2 px-2 py-1.5"><div className="text-[8.5px] text-faint">Toplam görev</div><div className="font-mono text-[11px] font-bold text-text">{Number(selectedTechnician.total_tasks || 0)}</div></div><div className="rounded-md border border-teal/20 bg-panel2 px-2 py-1.5"><div className="text-[8.5px] text-faint">Sorumlu</div><div className="font-mono text-[11px] font-bold text-text">{Number(selectedTechnician.responsible_tasks || 0)}</div></div><div className="rounded-md border border-teal/20 bg-panel2 px-2 py-1.5"><div className="text-[8.5px] text-faint">Yardımcı</div><div className="font-mono text-[11px] font-bold text-text">{Number(selectedTechnician.support_tasks || 0)}</div></div><div className="rounded-md border border-teal/20 bg-panel2 px-2 py-1.5"><div className="text-[8.5px] text-faint">Dakika</div><div className="font-mono text-[11px] font-bold text-text">{Number(selectedTechnician.duration_minutes || 0).toLocaleString("tr-TR")}</div></div></div></div> : null;
  const technicianRanking = <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Teknisyen sıralaması</div>{technicians.slice(0, 12).map((technician) => {
    const technicianId = String(technician.technician_id || technician.technician || "");
    const detail = technicianDetailMap.get(technicianId);
    const detailByType = detail && Array.isArray(detail.by_type) ? detail.by_type as Array<Record<string, unknown>> : [];
    const detailByEngine = detail && Array.isArray(detail.by_engine) ? detail.by_engine as Array<Record<string, unknown>> : [];
    const expanded = expandedTechnicianId === technicianId;
    return <div key={technicianId} className="border-b border-border last:border-0"><button type="button" onClick={() => setExpandedTechnicianId(expanded ? null : technicianId)} aria-expanded={expanded} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-amber"><span className="truncate text-[10.5px] font-bold text-text">{stringValue(technician.technician)}</span><span className="flex-shrink-0 font-mono text-[10px] text-muted">{Number(technician.responsible_count || 0) + Number(technician.support_count || 0)} görev · {expanded ? "kapat ↑" : "detay →"}</span></button>{expanded && <div className="mb-2 grid gap-2 rounded-md border border-amber/20 bg-amber/5 px-2.5 py-2 sm:grid-cols-2"><div><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">Bakım türleri</div>{detailByType.length ? detailByType.map((row) => <div key={String(row.type)} className="flex justify-between gap-2 border-b border-border/70 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(row.type)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Bakım türü detayı yok.</div>}</div><div><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">Çalışılan motorlar</div>{detailByEngine.length ? detailByEngine.map((row) => <div key={String(row.engine_id)} className="flex justify-between gap-2 border-b border-border/70 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(row.engine)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Motor detayı yok.</div>}</div></div>}</div>;
  })}</div>;
  const examples = Array.isArray(data.examples) ? data.examples.filter((item): item is string => typeof item === "string") : [];
  const breakdowns = <div className="mt-3 grid min-w-0 gap-2 lg:grid-cols-2">
    {byEngine.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Motor dağılımı</div>{byEngine.map((row) => {
      const engineId = String(row.engine_id || row.engine || "");
      const typeStats = Array.isArray(row.type_stats) ? row.type_stats as Array<Record<string, unknown>> : [];
      const expanded = expandedEngineId === engineId;
      return <div key={engineId} className="border-b border-border last:border-0"><button type="button" onClick={() => setExpandedEngineId(expanded ? null : engineId)} aria-expanded={expanded} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-amber"><span className="truncate text-[10.5px] text-muted">{stringValue(row.engine)}</span><span className="flex-shrink-0 font-mono text-[10px] text-text">{Number(row.count || 0)} · {expanded ? "kapat ↑" : "detay →"}</span></button>{expanded && <div className="mb-2 rounded-md border border-amber/20 bg-amber/5 px-2.5 py-2"><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">{stringValue(row.engine)} bakım türleri</div>{typeStats.length > 0 ? typeStats.map((type) => <div key={String(type.type)} className="flex justify-between gap-2 border-b border-border/70 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(type.type)}</span><span className="font-mono text-[10px] text-text">{Number(type.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Bu motor için bakım türü detayı bulunamadı.</div>}</div>}</div>;
    })}</div>}
    {byType.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Bakım türü</div>{byType.map((row) => {
      const type = String(row.type || "");
      const relatedEngines = Array.isArray(row.engines) ? row.engines as Array<Record<string, unknown>> : [];
      const expanded = expandedType === type;
      return <div key={type} className="border-b border-border last:border-0"><button type="button" onClick={() => setExpandedType(expanded ? null : type)} aria-expanded={expanded} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-amber"><span className="truncate text-[10.5px] text-muted">{type}</span><span className="flex-shrink-0 font-mono text-[10px] text-text">{Number(row.count || 0)} · {expanded ? "kapat ↑" : "detay →"}</span></button>{expanded && <div className="mb-2 rounded-md border border-amber/20 bg-amber/5 px-2.5 py-2"><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">{type} yapılan motorlar</div>{relatedEngines.length > 0 ? relatedEngines.map((engine) => <div key={String(engine.engine_id)} className="flex justify-between gap-2 border-b border-border/70 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(engine.engine)}</span><span className="font-mono text-[10px] text-text">{Number(engine.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Bu bakım türü için motor detayı bulunamadı.</div>}</div>}</div>;
    })}</div>}
  </div>;

  if (examples.length > 0) {
    return <div className="mt-3 grid gap-1.5">{examples.map((example) => <div key={example} className="rounded-lg border border-border bg-panel2 px-2.5 py-2 text-[10.5px] text-muted">{example}</div>)}</div>;
  }


  const records = Array.isArray(data.records) ? data.records as Array<Record<string, unknown>> : [];
  if (records.length > 0) {
    return <AssistantRecordResults data={data} records={records} expandedRecordId={expandedRecordId} setExpandedRecordId={setExpandedRecordId} />;
  }
  if (STRICT_DOMAIN_INTENTS.has(intent || "")) {
    return <AssistantDomainResults data={data} intent={intent} expandedRecordId={expandedRecordId} setExpandedRecordId={setExpandedRecordId} onForecastExcludedTypesChange={onForecastExcludedTypesChange} />;
  }
  if (selectedTechnicianSummary || activities.length > 0 || dailyMaintenanceRecords.length > 0 || technicians.length > 0 || (topTechnician && intent === "technician_performance")) {
    return <div className="mt-3 grid gap-2">
      {selectedTechnicianSummary}
      {topTechnician && intent === "technician_performance" && !selectedTechnician && <div className="rounded-lg border border-amber/30 bg-amber/10 p-2.5"><button type="button" onClick={() => setExpandedTechnicianId(expandedTechnicianId === topTechnicianId ? null : topTechnicianId)} aria-expanded={expandedTechnicianId === topTechnicianId} className="w-full text-left"><div className="text-[9px] font-bold uppercase tracking-wide text-amber">En çok görev alan teknisyen</div><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-[11.5px] font-bold text-text">{stringValue(topTechnician.full_name)}</span><span className="font-mono text-[10.5px] font-bold text-amber">{Number(topTechnician.total_tasks || 0)} görev · {expandedTechnicianId === topTechnicianId ? "kapat ↑" : "detay →"}</span></div></button>{expandedTechnicianId === topTechnicianId && <div className="mt-2 grid gap-2 border-t border-amber/20 pt-2 sm:grid-cols-2"><div><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">Bakım türleri</div>{topTechnicianByType.length ? topTechnicianByType.map((row) => <div key={String(row.type)} className="flex justify-between gap-2 border-b border-amber/10 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(row.type)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Bakım türü detayı yok.</div>}</div><div><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">Çalışılan motorlar</div>{topTechnicianByEngine.length ? topTechnicianByEngine.map((row) => <div key={String(row.engine_id)} className="flex justify-between gap-2 border-b border-amber/10 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(row.engine)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Motor detayı yok.</div>}</div></div>}</div>}
      {activities.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Çalışılan bakım ve motorlar</div>{activities.slice(0, 12).map((activity) => { const activityId = String(activity.id); const expanded = expandedActivityId === activityId; return <div key={activityId} className="border-b border-border last:border-0"><button type="button" onClick={() => setExpandedActivityId(expanded ? null : activityId)} aria-expanded={expanded} className="flex w-full items-start justify-between gap-2 py-1.5 text-left hover:text-amber"><div className="min-w-0"><div className="truncate text-[10.5px] font-bold text-text">{stringValue(activity.type)}</div><div className="truncate text-[9.5px] text-muted">{stringValue(activity.engine)} · {stringValue(activity.role)}</div></div><div className="flex-shrink-0 text-right text-[9px] text-faint">{formatDate(activity.created_at)}<br />{formatMinutes(activity.duration_minutes)} · {expanded ? "kapat ↑" : "detay →"}</div></button>{expanded && <div className="mb-2 grid gap-1 rounded-md border border-amber/20 bg-amber/5 px-2.5 py-2 text-[9.5px] text-muted"><div><span className="text-faint">Motor:</span> {stringValue(activity.engine)}</div><div><span className="text-faint">Bakım türü:</span> {stringValue(activity.type)}</div><div><span className="text-faint">Katkı rolü:</span> {stringValue(activity.role)} · <span className="text-faint">Çalışma süresi:</span> {formatMinutes(activity.duration_minutes)}</div><div><span className="text-faint">Başlangıç:</span> {formatDate(activity.start_at)} · <span className="text-faint">Kayıt:</span> {formatDate(activity.created_at)}</div></div>}</div>; })}</div>}
      {byEngine.length > 0 || byType.length > 0 ? breakdowns : null}
      {dailyMaintenanceRecords.length > 0 && <div className="min-w-0 rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Gün gün yapılan bakımlar</div><div className="grid min-w-0 gap-1.5">{dailyMaintenanceRecords.slice(0, 80).map((item, index) => { const types = Array.isArray(item.types) ? item.types.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : []; return <div key={`${String(item.event_id || item.date)}-${String(item.engine_id || "engine")}-${index}`} className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-border/70 py-1.5 last:border-0"><div className="min-w-0"><div className="break-words text-[10.5px] font-bold text-text">{formatDateOnly(item.date)} · {stringValue(item.engine)}</div><div className="break-words text-[9.5px] text-muted">{types.length ? types.join(" + ") : "Bakım türü belirtilmemiş"}</div><div className="text-[9px] text-faint">{Number(item.count || 0)} tür · {stringValue(item.source, "internal") === "external_service" ? "Dış hizmet" : "İç ekip"}</div></div><div className="flex-shrink-0 text-right font-mono text-[9.5px] text-muted">{formatMinutes(item.duration_minutes)}<br />ortak olay</div></div>; })}</div>{dailyMaintenanceRecords.length > 80 && <div className="mt-2 text-[9px] text-faint">Toplam {dailyMaintenanceRecords.length} olay bulundu; ekranda ilk 80 olay gösteriliyor.</div>}</div>}
      {technicians.length > 0 && !activities.length ? technicianRanking : null}
    </div>;
  }

  if (technicians.length > 0) return <div className="mt-3">{technicianRanking}</div>;

  if (services.length > 0 || engines.length > 0) {
    return <div className="mt-3 grid gap-2">{services.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Servisler</div>{services.map((service) => <div key={String(service.service)} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"><span className="truncate text-[10.5px] text-muted">{stringValue(service.service)}</span><span className="font-mono text-[10px] text-text">{Number(service.count || 0)} kayıt</span></div>)}</div>}{engines.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Motorlar</div>{engines.map((engine) => <div key={String(engine.engine_id)} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"><span className="truncate text-[10.5px] text-muted">{stringValue(engine.engine)}</span><span className="font-mono text-[10px] text-text">{Number(engine.count || 0)} kayıt</span></div>)}</div>}</div>;
  }

  if (byEngine.length > 0 || byType.length > 0) return breakdowns;

  if (intent === "summary") return <ResultEmpty>Seçilen filtrelerle eşleşen bakım kaydı bulunamadı.</ResultEmpty>;

  if (intent === "engine_history" && data.engine) {
    return <div className="mt-3 rounded-lg border border-border bg-panel2 p-2.5 text-[10.5px] text-muted">Görüntülenecek bakım kaydı bulunamadı.</div>;
  }
  return null;
}

export function detailHref(intent?: string): string | null {
  if (intent === "technician_performance") return "/teknisyen-raporu";
  if (intent === "engine_history") return "/rapor";
  if (intent === "overdue") return "/dashboard";
  if (intent === "maintenance_forecast") return "/tahmin";
  if (intent === "external_service") return "/kayitlar";
  return null;
}

