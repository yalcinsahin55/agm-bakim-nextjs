"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  title?: string;
  data?: Record<string, unknown>;
  intent?: string;
  period?: string;
  dateRange?: { from: string; to: string } | null;
  generatedAt?: string;
  error?: boolean;
  exportQuery?: Record<string, string>;
}

const QUICK_QUESTIONS = [
  "Bu ay kaç bakım yapıldı?",
  "Hangi bakımlar gecikmiş?",
  "Kritik ve geriye dönük bakımlar hangileri?",
  "Başlangıç veya bitiş saati eksik bakımlar hangileri?",
  "Teyit bekleyen bakımlar hangileri?",
  "Bakım istatistiklerinin özeti nedir?",
  "En çok hangi teknisyen görev aldı?",
  "Bu ay fotoğraflı bakımlar hangileri?",
  "1000 saat ile 1500 saat arasında hangi bakımlar yapıldı?",
  "Dış servisten hizmet alınan motorlar ve bakımlar hangileri?",
  "İç ekip tarafından yapılan ekip bakımları hangileri?",
];

function formatMinutes(value: unknown): string {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remaining = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} gün`);
  if (hours) parts.push(`${hours} saat`);
  if (remaining || parts.length === 0) parts.push(`${remaining} dk`);
  return parts.join(" ");
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

function formatDateOnly(value: unknown): string {
  const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "—";
}

function stringValue(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function VoiceInputButton({ disabled, onTranscript }: { disabled: boolean; onTranscript: (text: string) => void }) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    setSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    };
  }, []);

  if (!supported) return <span role="status" aria-live="polite" className="max-w-[150px] text-[9px] leading-3 text-faint">Bu tarayıcı sesli girişi desteklemiyor. Soruyu yazabilir veya telefon klavyesinin mikrofonunu kullanabilirsin.</span>;

  function toggleListening() {
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    if (listening) {
      try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
      return;
    }
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = "tr-TR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setStatus("Dinleniyor... Konuşabilirsin."); };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        onTranscript(transcript);
        setStatus("Soru hazırlandı; göndermeden önce kontrol edebilirsin.");
      } else {
        setStatus("Ses algılanamadı; tekrar deneyebilir veya yazabilirsin.");
      }
    };
    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      const errorMessage = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin ver veya soruyu yaz."
        : event.error === "no-speech"
          ? "Ses algılanamadı; tekrar deneyebilir veya yazabilirsin."
          : "Sesli giriş başlatılamadı; soruyu yazabilirsin.";
      setStatus(errorMessage);
    };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setStatus("Mikrofon başlatılıyor...");
    try {
      recognition.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
      setStatus("Sesli giriş başlatılamadı. Mikrofon iznini ve tarayıcı ayarlarını kontrol et.");
    }
  }

  return <div className="flex min-w-[74px] flex-col items-start gap-1"><button type="button" onClick={toggleListening} disabled={disabled} aria-label={listening ? "Sesli girişi durdur" : "Sesli soru söyle"} aria-pressed={listening} className={`rounded-xl border px-3 py-2.5 text-[10px] font-bold transition ${listening ? "border-red/50 bg-red/10 text-red" : "border-border bg-panel text-muted hover:border-amber/50 hover:text-amber"} disabled:cursor-not-allowed disabled:opacity-50`}>{listening ? "Durdur" : "Mikrofon"}</button>{status && <span role="status" aria-live="polite" className="max-w-[150px] text-[9px] leading-3 text-faint">{status}</span>}</div>;
}

function localDateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function periodDateQuery(period?: string): Record<string, string> {
  if (!period || period === "all") return {};
  const now = new Date();
  const start = period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : period === "3months" ? new Date(now.getFullYear(), now.getMonth() - 2, 1) : new Date(now.getFullYear(), 0, 1);
  return { from: localDateString(start), to: localDateString(now) };
}

function exportFileName(kind: "pdf" | "excel"): string {
  return kind === "pdf" ? "AGM_Bakim_Asistan_Raporu.pdf" : "AGM_Bakim_Asistan_Raporu.xlsx";
}

function buildExportQuery(intent: string | undefined, period: string | undefined, dateRange: { from: string; to: string } | null | undefined, data: Record<string, unknown> | undefined): Record<string, string> {
  if (!intent || intent === "help" || intent === "overdue") return {};
  const query = dateRange ? { from: dateRange.from, to: dateRange.to } : periodDateQuery(period);
  const filters = data?.filters && typeof data.filters === "object" ? data.filters as Record<string, unknown> : {};
  if (intent === "external_service") query.source = "external_service";
  if (intent === "technician_performance") {
    const selected = data?.selected_technician as Record<string, unknown> | null | undefined;
    if (selected?.id) query.technician_id = String(selected.id);
    if (filters.role === "responsible" || filters.role === "support") query.technician_role = String(filters.role);
  }
  if (intent === "engine_history" && data?.engine_id) query.engine_id = String(data.engine_id);
  if (typeof filters.engine_id === "string" && filters.engine_id) query.engine_id = filters.engine_id;
  if (typeof filters.maintenance_type === "string" && filters.maintenance_type) query.type_label = filters.maintenance_type;
  if (typeof filters.service === "string" && filters.service) query.service = filters.service;
  if (typeof filters.evidence === "string" && filters.evidence) query.evidence = filters.evidence;
  if (typeof filters.status === "string" && filters.status) query.status = filters.status;
  const recordFilters = Array.isArray(filters.record_filters) ? filters.record_filters.filter((value): value is string => typeof value === "string") : [];
  if (recordFilters.length) query.record_filter = recordFilters.join(",");
  if (filters.team_only === true) query.team_only = "true";
  const hourRange = filters.hour_range && typeof filters.hour_range === "object" ? filters.hour_range as Record<string, unknown> : null;
  if (hourRange?.min !== undefined) query.hour_min = String(hourRange.min);
  if (hourRange?.max !== undefined) query.hour_max = String(hourRange.max);
  const durationRange = filters.duration_range && typeof filters.duration_range === "object" ? filters.duration_range as Record<string, unknown> : null;
  if (durationRange?.min !== undefined) query.duration_min = String(durationRange.min);
  if (durationRange?.max !== undefined) query.duration_max = String(durationRange.max);
  return query;
}

function ExportActions({ exportQuery }: { exportQuery: Record<string, string> }) {
  const [busy, setBusy] = useState<"pdf" | "excel" | "">("");
  const [error, setError] = useState("");

  async function download(kind: "pdf" | "excel") {
    setBusy(kind);
    setError("");
    try {
      const endpoint = kind === "pdf" ? "/api/export/pdf" : "/api/export/excel";
      const params = new URLSearchParams(exportQuery);
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) throw new Error(response.status === 401 ? "Oturum süresi doldu." : "Dosya hazırlanamadı.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(kind);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Dosya indirilemedi.");
    } finally {
      setBusy("");
    }
  }

  return <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[9px] text-faint">Bu cevabın raporunu indir:</span><button type="button" onClick={() => void download("pdf")} disabled={Boolean(busy)} className="rounded-lg border border-border bg-panel2 px-2.5 py-1.5 text-[10px] font-bold text-muted transition hover:border-amber/50 hover:text-amber disabled:opacity-50">{busy === "pdf" ? "Hazırlanıyor..." : "PDF indir"}</button><button type="button" onClick={() => void download("excel")} disabled={Boolean(busy)} className="rounded-lg border border-border bg-panel2 px-2.5 py-1.5 text-[10px] font-bold text-muted transition hover:border-green/50 hover:text-green disabled:opacity-50">{busy === "excel" ? "Hazırlanıyor..." : "Excel indir"}</button>{error && <span className="text-[9px] text-red">{error}</span>}</div>;
}

function AppliedFilters({ data, dateRange }: { data: Record<string, unknown>; dateRange?: { from: string; to: string } | null }) {
  const filters = data.filters && typeof data.filters === "object" ? data.filters as Record<string, unknown> : {};
  const items: string[] = [];
  if (dateRange) items.push(`${formatDateOnly(dateRange.from)} – ${formatDateOnly(dateRange.to)}`);
  if (typeof filters.engine === "string" && filters.engine) items.push(`Motor: ${filters.engine}`);
  if (typeof filters.maintenance_type === "string" && filters.maintenance_type) items.push(`Tür: ${filters.maintenance_type}`);
  if (filters.role === "responsible") items.push("Rol: Sorumlu");
  if (filters.role === "support") items.push("Rol: Yardımcı");
  if (filters.source === "internal") items.push("Kaynak: İç ekip");
  if (filters.source === "external_service") items.push("Kaynak: Dış hizmet");
  if (typeof filters.service === "string" && filters.service) items.push(`Servis: ${filters.service}`);
  const evidenceLabels: Record<string, string> = { photo: "Fotoğraf", video: "Video", note: "Not", checklist: "Kontrol listesi" };
  const statusLabels: Record<string, string> = { overdue: "Gecikmiş", critical: "Kritik", upcoming: "Yaklaşan", normal: "Normal" };
  if (typeof filters.evidence === "string" && filters.evidence) items.push(`Kanıt: ${evidenceLabels[filters.evidence] || filters.evidence}`);
  if (typeof filters.status === "string" && filters.status) items.push(`Durum: ${statusLabels[filters.status] || filters.status}`);
  const recordLabels: Record<string, string> = { backdated: "Geriye dönük kayıt", missing_time: "Eksik başlangıç/bitiş", unconfirmed: "Teyit bekliyor" };
  const recordFilters = Array.isArray(filters.record_filters) ? filters.record_filters.filter((value): value is string => typeof value === "string") : [];
  recordFilters.forEach((filter) => items.push(recordLabels[filter] || filter));
  if (filters.team_only === true) items.push("Ekip çalışması");
  const hourRange = filters.hour_range && typeof filters.hour_range === "object" ? filters.hour_range as Record<string, unknown> : null;
  const durationRange = filters.duration_range && typeof filters.duration_range === "object" ? filters.duration_range as Record<string, unknown> : null;
  if (hourRange && (hourRange.min !== undefined || hourRange.max !== undefined)) items.push(`Motor saati: ${hourRange.min ?? "…"}–${hourRange.max ?? "…"}`);
  if (durationRange && (durationRange.min !== undefined || durationRange.max !== undefined)) items.push(`Süre: ${durationRange.min ?? "…"}–${durationRange.max ?? "…"}`);
  if (!items.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Uygulanan filtreler"><span className="text-[9px] font-bold uppercase tracking-wide text-faint">Filtreler:</span>{items.map((item) => <span key={item} className="rounded-full border border-border bg-panel2 px-2 py-0.5 text-[9px] text-muted">{item}</span>)}</div>;
}

function ResultDetails({ data, intent }: { data: Record<string, unknown>; intent?: string }) {
  const [expandedEngineId, setExpandedEngineId] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [expandedTechnicianId, setExpandedTechnicianId] = useState<string | null>(null);
  const overdueItems = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  const records = Array.isArray(data.records) ? data.records as Array<Record<string, unknown>> : [];
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
  const technicianRanking = <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Teknisyen sıralaması</div>{technicians.slice(0, 12).map((technician) => {
    const technicianId = String(technician.technician_id || technician.technician || "");
    const detail = technicianDetailMap.get(technicianId);
    const detailByType = detail && Array.isArray(detail.by_type) ? detail.by_type as Array<Record<string, unknown>> : [];
    const detailByEngine = detail && Array.isArray(detail.by_engine) ? detail.by_engine as Array<Record<string, unknown>> : [];
    const expanded = expandedTechnicianId === technicianId;
    return <div key={technicianId} className="border-b border-border last:border-0"><button type="button" onClick={() => setExpandedTechnicianId(expanded ? null : technicianId)} aria-expanded={expanded} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-amber"><span className="truncate text-[10.5px] font-bold text-text">{stringValue(technician.technician)}</span><span className="flex-shrink-0 font-mono text-[10px] text-muted">{Number(technician.responsible_count || 0) + Number(technician.support_count || 0)} görev · {expanded ? "kapat ↑" : "detay →"}</span></button>{expanded && <div className="mb-2 grid gap-2 rounded-md border border-amber/20 bg-amber/5 px-2.5 py-2 sm:grid-cols-2"><div><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">Bakım türleri</div>{detailByType.length ? detailByType.map((row) => <div key={String(row.type)} className="flex justify-between gap-2 border-b border-border/70 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(row.type)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Bakım türü detayı yok.</div>}</div><div><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">Çalışılan motorlar</div>{detailByEngine.length ? detailByEngine.map((row) => <div key={String(row.engine_id)} className="flex justify-between gap-2 border-b border-border/70 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(row.engine)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Motor detayı yok.</div>}</div></div>}</div>;
  })}</div>;
  const examples = Array.isArray(data.examples) ? data.examples.filter((item): item is string => typeof item === "string") : [];
  const breakdowns = <div className="mt-3 grid gap-2 sm:grid-cols-2">
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

  if (overdueItems.length > 0) {
    return <div className="mt-3 grid gap-2">{overdueItems.map((item) => <div key={`${String(item.engine_id)}-${String(item.type_key)}`} className="rounded-lg border border-red/25 bg-red/5 p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(item.engine)}</div><div className="mt-0.5 truncate text-[10px] text-muted">{stringValue(item.type)}</div></div><span className="flex-shrink-0 rounded-full bg-red/10 px-2 py-1 text-[9px] font-bold text-red">{Number(item.overdue_hours || 0).toLocaleString("tr-TR")} sa gecikme</span></div></div>)}</div>;
  }

  if (records.length > 0) {
    return <div className="mt-3 grid gap-2">{records.slice(0, 8).map((record) => <div key={String(record.id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-start justify-between gap-2"><div><div className="text-[11px] font-bold text-text">{stringValue(record.type)}</div><div className="mt-0.5 text-[10px] text-muted">{stringValue(record.technician)}</div></div><div className="text-right text-[9.5px] text-faint">{formatDate(record.created_at)}<br />{formatMinutes(record.duration_minutes)}</div></div><div className="mt-2 text-[9.5px] text-faint">Motor saati: {Number(record.hour_at_completion || 0).toLocaleString("tr-TR")} · Başlangıç: {formatDate(record.start_at)}</div></div>)}</div>;
  }

  if (activities.length > 0 || technicians.length > 0 || (topTechnician && intent === "technician_performance")) {
    return <div className="mt-3 grid gap-2">
      {topTechnician && intent === "technician_performance" && <div className="rounded-lg border border-amber/30 bg-amber/10 p-2.5"><button type="button" onClick={() => setExpandedTechnicianId(expandedTechnicianId === topTechnicianId ? null : topTechnicianId)} aria-expanded={expandedTechnicianId === topTechnicianId} className="w-full text-left"><div className="text-[9px] font-bold uppercase tracking-wide text-amber">En çok görev alan teknisyen</div><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-[11.5px] font-bold text-text">{stringValue(topTechnician.full_name)}</span><span className="font-mono text-[10.5px] font-bold text-amber">{Number(topTechnician.total_tasks || 0)} görev · {expandedTechnicianId === topTechnicianId ? "kapat ↑" : "detay →"}</span></div></button>{expandedTechnicianId === topTechnicianId && <div className="mt-2 grid gap-2 border-t border-amber/20 pt-2 sm:grid-cols-2"><div><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">Bakım türleri</div>{topTechnicianByType.length ? topTechnicianByType.map((row) => <div key={String(row.type)} className="flex justify-between gap-2 border-b border-amber/10 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(row.type)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Bakım türü detayı yok.</div>}</div><div><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber">Çalışılan motorlar</div>{topTechnicianByEngine.length ? topTechnicianByEngine.map((row) => <div key={String(row.engine_id)} className="flex justify-between gap-2 border-b border-amber/10 py-1 last:border-0"><span className="truncate text-[10px] text-muted">{stringValue(row.engine)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)} kayıt</span></div>) : <div className="text-[10px] text-muted">Motor detayı yok.</div>}</div></div>}</div>}
      {activities.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Çalışılan bakım ve motorlar</div>{activities.slice(0, 12).map((activity) => <div key={String(activity.id)} className="flex items-start justify-between gap-2 border-b border-border py-1.5 last:border-0"><div className="min-w-0"><div className="truncate text-[10.5px] font-bold text-text">{stringValue(activity.type)}</div><div className="truncate text-[9.5px] text-muted">{stringValue(activity.engine)} · {stringValue(activity.role)}</div></div><div className="flex-shrink-0 text-right text-[9px] text-faint">{formatDate(activity.created_at)}<br />{formatMinutes(activity.duration_minutes)}</div></div>)}</div>}
      {byEngine.length > 0 || byType.length > 0 ? breakdowns : null}
      {technicians.length > 0 && !activities.length ? technicianRanking : null}
    </div>;
  }

  if (technicians.length > 0) return <div className="mt-3">{technicianRanking}</div>;

  if (services.length > 0 || engines.length > 0) {
    return <div className="mt-3 grid gap-2">{services.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Servisler</div>{services.map((service) => <div key={String(service.service)} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"><span className="truncate text-[10.5px] text-muted">{stringValue(service.service)}</span><span className="font-mono text-[10px] text-text">{Number(service.count || 0)} kayıt</span></div>)}</div>}{engines.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Motorlar</div>{engines.map((engine) => <div key={String(engine.engine_id)} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"><span className="truncate text-[10.5px] text-muted">{stringValue(engine.engine)}</span><span className="font-mono text-[10px] text-text">{Number(engine.count || 0)} kayıt</span></div>)}</div>}</div>;
  }

  if (byEngine.length > 0 || byType.length > 0) return breakdowns;

  if (intent === "engine_history" && data.engine) {
    return <div className="mt-3 rounded-lg border border-border bg-panel2 p-2.5 text-[10.5px] text-muted">Görüntülenecek bakım kaydı bulunamadı.</div>;
  }
  return null;
}

function detailHref(intent?: string): string | null {
  if (intent === "technician_performance") return "/teknisyen-raporu";
  if (intent === "engine_history") return "/rapor";
  if (intent === "overdue") return "/dashboard";
  if (intent === "external_service") return "/kayitlar";
  return null;
}

export default function AssistantPage() {
  const { user, loading } = useCurrentUser();
  const searchParams = useSearchParams();
  const initialQuestion = searchParams.get("question")?.trim() || "";
  const shouldAutoSend = searchParams.get("auto") === "1";
  const autoSentQuestionRef = useRef("");
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", role: "assistant", text: "Merhaba. AGM Bakım raporlarından salt okunur özetler hazırlayabilirim. Kayıt oluşturamam, değiştiremem veya silemem.", title: "Bakım Asistanı" },
  ]);

  const canAsk = useMemo(() => Boolean(user) && !sending, [sending, user]);

  useEffect(() => {
    if (!initialQuestion || initialQuestion.length > 300) return;
    if (shouldAutoSend) {
      if (user && !loading && autoSentQuestionRef.current !== initialQuestion) {
        autoSentQuestionRef.current = initialQuestion;
        void ask(initialQuestion);
      }
      return;
    }
    setQuestion((current) => current || initialQuestion);
  }, [initialQuestion, loading, shouldAutoSend, user]);

  async function ask(value: string) {
    const nextQuestion = value.trim();
    if (!nextQuestion || !canAsk) return;
    setQuestion("");
    setSending(true);
    const userMessage: AssistantMessage = { id: `u-${Date.now()}`, role: "user", text: nextQuestion };
    setMessages((current) => [...current, userMessage]);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: nextQuestion }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: payload.message || payload.error || "Asistan şu anda yanıt veremiyor.", error: true }]);
        return;
      }
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: payload.summary || "Sonuç hazırlandı.", title: payload.title, data: payload.data, intent: payload.meta?.intent, period: payload.meta?.period, dateRange: payload.meta?.date_range, generatedAt: payload.meta?.generated_at, exportQuery: buildExportQuery(payload.meta?.intent, payload.meta?.period, payload.meta?.date_range, payload.data) }]);
    } catch {
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: "Asistan isteği tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.", error: true }]);
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void ask(question);
    }
  }

  if (loading) return <div className="min-h-screen bg-bg p-4 text-sm text-muted">Bakım Asistanı yükleniyor...</div>;

  return <div className="min-h-screen pb-20"><TopBar title="Bakım Asistanı" subtitle="Salt okunur rapor yardımcısı" /><main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4"><div className="rounded-card border border-amber/30 bg-gradient-to-br from-panel to-panel2 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-base font-extrabold text-text">Raporlarını sor</div><p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">Asistan yalnızca AGM Bakım’daki rapor ve bakım verilerini okur. Kayıt oluşturmaz, düzenlemez, silmez ve teknisyen atamaz.</p></div><span className="flex-shrink-0 rounded-full border border-green/30 bg-green/10 px-2.5 py-1 text-[9px] font-bold text-green">SALT OKUNUR</span></div></div><section aria-label="Hızlı sorular"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Hızlı sorular</div><div className="flex gap-2 overflow-x-auto pb-1">{QUICK_QUESTIONS.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={!canAsk} className="flex-shrink-0 rounded-full border border-border bg-panel px-3 py-2 text-[10px] font-semibold text-muted transition hover:border-amber/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-50">{item}</button>)}</div></section><section aria-label="Asistan konuşması" className="flex flex-col gap-3">{messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`w-full max-w-3xl rounded-card border p-3.5 ${message.role === "user" ? "border-amber/30 bg-amber/10 sm:max-w-xl" : message.error ? "border-red/30 bg-red/5" : "border-border bg-panel"}`}><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-faint">{message.role === "user" ? "Sen" : message.title || "Bakım Asistanı"}</div>{message.role === "assistant" && message.intent && <span className="text-[9px] text-faint">{message.dateRange ? `${formatDateOnly(message.dateRange.from)} – ${formatDateOnly(message.dateRange.to)}` : message.period === "month" ? "Bu ay" : message.period === "3months" ? "Son 3 ay" : message.period === "year" ? "Bu yıl" : "Tümü"}</span>}</div><div className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5 text-text">{message.text}</div>{message.data && message.intent && <AppliedFilters data={message.data} dateRange={message.dateRange} />}{message.data && message.intent && <ResultDetails data={message.data} intent={message.intent} />}{message.role === "assistant" && message.intent && detailHref(message.intent) && <Link href={detailHref(message.intent)!} className="mt-3 inline-flex text-[10px] font-bold text-amber hover:underline">Detay raporunu aç →</Link>}{message.role === "assistant" && message.exportQuery && Object.keys(message.exportQuery).length > 0 && <ExportActions exportQuery={message.exportQuery} />}{message.generatedAt && <div className="mt-2 text-[9px] text-faint">Rapor verisi: {formatDate(message.generatedAt)}</div>}</div></div>)}{sending && <div className="flex justify-start"><div className="rounded-card border border-border bg-panel px-3.5 py-3 text-[11px] text-muted">Raporlar okunuyor...</div></div>}</section><form onSubmit={submit} className="sticky bottom-16 z-10 rounded-card border border-border bg-bg/95 p-2 shadow-xl backdrop-blur"><div className="flex gap-2"><VoiceInputButton disabled={!canAsk} onTranscript={(text) => setQuestion((current) => `${current.trim()}${current.trim() ? " " : ""}${text.trim()}`.slice(0, 300))} /><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleKeyDown} maxLength={300} disabled={!canAsk} placeholder="Örn. Bu ay kaç bakım yapıldı?" aria-label="Bakım asistanına soru yazın" className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-3 py-2.5 text-[12px] text-text outline-none placeholder:text-faint focus:border-amber/60" /><button type="submit" disabled={!canAsk || !question.trim()} className="rounded-xl bg-amber px-4 py-2.5 text-[11px] font-bold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{sending ? "..." : "Sor"}</button></div><div className="mt-1 px-1 text-right text-[9px] text-faint">{question.length}/300 · Yalnızca rapor okuma</div></form></main><BottomNav /></div>;
}
