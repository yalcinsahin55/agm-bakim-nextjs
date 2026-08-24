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
  question?: string;
}

const QUICK_QUESTIONS = [
  "Bu ay kaç bakım yapıldı?",
  "Hangi bakımlar gecikmiş?",
  "Geriye dönük bakım kayıtları hangileri?",
  "Başlangıç veya bitiş saati eksik bakımlar hangileri?",
  "Yönetici teyidi bekleyen bakımlar hangileri?",
  "Bakım istatistiklerinin özeti nedir?",
  "En çok hangi teknisyen görev aldı?",
  "Bu ay fotoğraflı bakımlar hangileri?",
  "Kritik bakımlar hangileri?",
  "Dış servisten hizmet alınan motorlar ve bakımlar hangileri?",
  "İç ekip tarafından yapılan ekip bakımları hangileri?",
  "Gelecek yıl hangi bakımlar gelecek? Gecikmişleri de göster.",
  "Kaç 9000 saatlik bakım var? Motorları ve tahmini tarihleri göster.",
  "Tüm motorların çalışma saatleri ve yükleri nasıl?",
  "Bakım türleri ve periyotları neler?",
  "Son karter basınç ölçümleri neler?",
  "Son yağ analizleri neler?",
  "Motor teknik bilgi kartları neler?",
  "Aktif teknisyenler kimler?",
  "Okunmamış bildirimlerim hangileri?",
  "Motor bakım sağlığı ve kalan saatler nasıl?",
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

function exportFileName(kind: "pdf" | "excel", exportQuery: Record<string, string>): string {
  if (exportQuery.forecast === "1") return kind === "pdf" ? "AGM_Bakim_Tahmin_Plani.pdf" : "AGM_Bakim_Tahmin_Plani.xlsx";
  return kind === "pdf" ? "AGM_Bakim_Asistan_Raporu.pdf" : "AGM_Bakim_Asistan_Raporu.xlsx";
}

function buildExportQuery(intent: string | undefined, period: string | undefined, dateRange: { from: string; to: string } | null | undefined, data: Record<string, unknown> | undefined): Record<string, string> {
  const exportableIntents = new Set(["summary", "technician_performance", "external_service", "engine_history", "maintenance_forecast", "engine_data"]);
  if (!intent || !exportableIntents.has(intent)) return {};
  const query = dateRange ? { from: dateRange.from, to: dateRange.to } : periodDateQuery(period);
  const filters = data?.filters && typeof data.filters === "object" ? data.filters as Record<string, unknown> : {};
  if (intent === "maintenance_forecast") {
    query.forecast = "1";
    if (typeof filters.target_year === "number") query.target_year = String(filters.target_year);
    if (typeof filters.maintenance_period_hours === "number") query.maintenance_period_hours = String(filters.maintenance_period_hours);
    if (typeof filters.engine_id === "string" && filters.engine_id) query.engine_id = filters.engine_id;
    if (typeof filters.maintenance_type === "string" && filters.maintenance_type) query.type_label = filters.maintenance_type;
    if (typeof filters.status === "string" && filters.status) query.status = filters.status;
    const excludedTypes = Array.isArray(data?.excluded_type_labels) ? data.excluded_type_labels.filter((value): value is string => typeof value === "string") : [];
    if (excludedTypes.length) query.exclude_type_label = excludedTypes.join(",");
    return query;
  }
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

function ExportActions({ question, exportQuery = {} }: { question: string; exportQuery?: Record<string, string> }) {
  const [busy, setBusy] = useState<"pdf" | "excel" | "">("");
  const [error, setError] = useState("");

  async function download(kind: "pdf" | "excel") {
    setBusy(kind);
    setError("");
    try {
      const params = new URLSearchParams({ question, format: kind });
      const excludedTypes = exportQuery.exclude_type_label;
      if (excludedTypes) params.set("exclude_type_label", excludedTypes);
      const response = await fetch(`/api/assistant/export?${params.toString()}`, { cache: "no-store" });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes(kind === "pdf" ? "application/pdf" : "spreadsheetml")) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(response.status === 401 ? "Oturum süresi doldu." : payload.error || "Dosya hazırlanamadı.");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Boş rapor dosyası oluşturuldu.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(kind, exportQuery);
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

  return <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[9px] text-faint">Bu cevabın raporunu indir:</span><button type="button" onClick={() => void download("pdf")} disabled={Boolean(busy)} className="rounded-lg border border-border bg-panel2 px-2.5 py-1.5 text-[10px] font-bold text-muted transition hover:border-amber/50 hover:text-amber disabled:opacity-50">{busy === "pdf" ? "Hazırlanıyor..." : "PDF indir"}</button><button type="button" onClick={() => void download("excel")} disabled={Boolean(busy)} className="rounded-lg border border-border bg-panel2 px-2.5 py-1.5 text-[10px] font-bold text-muted transition hover:border-green/50 hover:text-green disabled:opacity-50">{busy === "excel" ? "Hazırlanıyor..." : "Excel indir"}</button>{error && <span role="alert" className="text-[9px] text-red">{error}</span>}</div>;
}

function ResultEmpty({ children }: { children: string }) {
  return <div className="mt-3 rounded-lg border border-border bg-panel2 px-2.5 py-2.5 text-[10.5px] text-muted">{children}</div>;
}

function AppliedFilters({ data, dateRange }: { data: Record<string, unknown>; dateRange?: { from: string; to: string } | null }) {
  const filters = data.filters && typeof data.filters === "object" ? data.filters as Record<string, unknown> : {};
  const items: string[] = [];
  if (dateRange) items.push(`${formatDateOnly(dateRange.from)} – ${formatDateOnly(dateRange.to)}`);
  if (typeof filters.engine === "string" && filters.engine) items.push(`Motor: ${filters.engine}`);
  if (typeof filters.maintenance_type === "string" && filters.maintenance_type) items.push(`Tür: ${filters.maintenance_type}`);
  if (typeof filters.target_year === "number") items.push(`Plan yılı: ${filters.target_year}`);
  const excludedTypeLabels = Array.isArray(data.excluded_type_labels) ? data.excluded_type_labels.filter((value): value is string => typeof value === "string") : [];
  if (excludedTypeLabels.length) items.push(`Hariç: ${excludedTypeLabels.join(", ")}`);
  if (typeof filters.maintenance_period_hours === "number") items.push(`Periyot: ${filters.maintenance_period_hours.toLocaleString("tr-TR")} saat`);
  if (filters.role === "responsible") items.push("Rol: Sorumlu");
  if (filters.role === "support") items.push("Rol: Yardımcı");
  if (filters.source === "internal") items.push("Kaynak: İç ekip");
  if (filters.source === "external_service") items.push("Kaynak: Dış hizmet");
  if (typeof filters.service === "string" && filters.service) items.push(`Servis: ${filters.service}`);
  const evidenceLabels: Record<string, string> = { photo: "Fotoğraf", video: "Video", note: "Not", checklist: "Kontrol listesi" };
  const statusLabels: Record<string, string> = { overdue: "Gecikmiş", critical: "Kritik", upcoming: "Yaklaşan", normal: "Normal" };
  if (typeof filters.evidence === "string" && filters.evidence) items.push(`Kanıt: ${evidenceLabels[filters.evidence] || filters.evidence}`);
  if (typeof filters.status === "string" && filters.status) items.push(`Durum: ${statusLabels[filters.status] || filters.status}`);
  const recordLabels: Record<string, string> = { backdated: "Geriye dönük kayıt", missing_time: "Eksik başlangıç/bitiş", unconfirmed: "Yönetici teyidi bekliyor" };
  const recordFilters = Array.isArray(filters.record_filters) ? filters.record_filters.filter((value): value is string => typeof value === "string") : [];
  recordFilters.forEach((filter) => items.push(recordLabels[filter] || filter));
  if (filters.team_only === true) items.push("Ekip çalışması");
  const hourRange = filters.hour_range && typeof filters.hour_range === "object" ? filters.hour_range as Record<string, unknown> : null;
  const durationRange = filters.duration_range && typeof filters.duration_range === "object" ? filters.duration_range as Record<string, unknown> : null;
  if (hourRange && (hourRange.min !== undefined || hourRange.max !== undefined)) items.push(`Motor saati: ${hourRange.min ?? "…"}–${hourRange.max ?? "…"}`);
  if (durationRange && (durationRange.min !== undefined || durationRange.max !== undefined)) items.push(`Süre: ${durationRange.min ?? "…"}–${durationRange.max ?? "…"}`);
  if (!items.length) return null;
  return <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-1.5" aria-label="Uygulanan filtreler"><span className="text-[9px] font-bold uppercase tracking-wide text-faint">Filtreler:</span>{items.map((item) => <span key={item} className="rounded-full border border-border bg-panel2 px-2 py-0.5 text-[9px] text-muted">{item}</span>)}</div>;
}

function ResultDetails({ data, intent, onForecastExcludedTypesChange }: { data: Record<string, unknown>; intent?: string; onForecastExcludedTypesChange?: (excludedTypes: string[]) => void }) {
  const [expandedEngineId, setExpandedEngineId] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [expandedTechnicianId, setExpandedTechnicianId] = useState<string | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const allResultItems = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  const overdueItems = intent === "overdue" ? allResultItems : [];
  const forecastItems = intent === "maintenance_forecast" ? allResultItems : [];
  const records = Array.isArray(data.records) ? data.records as Array<Record<string, unknown>> : [];
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
  const engineRows = Array.isArray(data.engines) ? data.engines as Array<Record<string, unknown>> : [];
  const performanceDaily = Array.isArray(data.performance_daily) ? data.performance_daily as Array<Record<string, unknown>> : [];
  const catalogTypes = Array.isArray(data.types) ? data.types as Array<Record<string, unknown>> : [];
  const pressureRows = Array.isArray(data.readings) ? data.readings as Array<Record<string, unknown>> : [];
  const oilRows = Array.isArray(data.analyses) ? data.analyses as Array<Record<string, unknown>> : [];
  const equipmentRows = Array.isArray(data.infos) ? data.infos as Array<Record<string, unknown>> : [];
  const directoryRows = intent === "technician_directory" && Array.isArray(data.technicians) ? data.technicians as Array<Record<string, unknown>> : [];
  const notificationRows = Array.isArray(data.notifications) ? data.notifications as Array<Record<string, unknown>> : [];
  const healthItems = intent === "maintenance_health" ? allResultItems : [];
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
    return <div className="mt-3 grid gap-2"><div className="flex flex-wrap gap-1.5">{Object.entries(statusLabels).map(([key, label]) => <span key={key} className="rounded-full border border-border bg-panel2 px-2 py-1 text-[9.5px] text-muted">{label}: <b className="font-mono text-text">{Number(counts[key] || 0)}</b></span>)}</div><div className="grid gap-1.5">{healthItems.slice(0, 40).map((item) => <div key={`${String(item.engine_id)}-${String(item.type_key)}`} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-panel2 px-2.5 py-2"><div className="min-w-0"><div className="truncate text-[10.5px] font-bold text-text">{stringValue(item.engine)} · {stringValue(item.type)}</div><div className="mt-0.5 text-[9px] text-faint">Motor saati: {Number(item.engine_hours || 0).toLocaleString("tr-TR")} · Son bakım: {Number(item.last_hour || 0).toLocaleString("tr-TR")} · Periyot: {Number(item.period_hours || 0).toLocaleString("tr-TR")} saat</div></div><span className={`flex-shrink-0 font-mono text-[10px] font-bold ${item.status === "gecikmis" ? "text-red" : item.status === "kritik" ? "text-amber" : item.status === "yaklasiyor" ? "text-yellow-300" : "text-green"}`}>{Number(item.remaining_hours || 0).toLocaleString("tr-TR")} saat</span></div>)}</div>{healthItems.length === 0 && <ResultEmpty>Seçilen motor, bakım türü veya durumla eşleşen bakım sağlığı kaydı bulunamadı.</ResultEmpty>}</div>
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

  if (records.length > 0) {
    const recordTotal = Number(data.total_records || records.length);
    return <div className="mt-3 grid gap-2">{recordTotal > records.length && <div className="rounded-lg border border-amber/25 bg-amber/5 px-2.5 py-2 text-[10px] text-muted">Toplam {recordTotal} bakım kaydı bulundu; en güncel {records.length} kayıt gösteriliyor.</div>}{records.slice(0, 8).map((record) => {
      const recordId = String(record.id);
      const expanded = expandedRecordId === recordId;
      const collaborators = Array.isArray(record.other_technicians) ? record.other_technicians.map((item) => String(item)).filter(Boolean).join(", ") : "";
      return <div key={recordId} className="rounded-lg border border-border bg-panel2 p-2.5"><button type="button" onClick={() => setExpandedRecordId(expanded ? null : recordId)} aria-expanded={expanded} className="w-full text-left"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(record.type)}</div><div className="mt-0.5 truncate text-[10px] text-muted">{stringValue(record.technician)}</div></div><div className="flex-shrink-0 text-right text-[9.5px] text-faint">{formatDate(record.created_at)}<br />{formatMinutes(record.duration_minutes)} · {expanded ? "kapat ↑" : "detay →"}</div></div><div className="mt-2 text-[9.5px] text-faint">Motor: {stringValue(record.engine_name, stringValue(data.engine))} · Motor saati: {Number(record.hour_at_completion || 0).toLocaleString("tr-TR")}</div></button>{expanded && <div className="mt-2 grid gap-1 border-t border-border pt-2 text-[9.5px] text-muted"><div><span className="text-faint">Başlangıç:</span> {formatDate(record.start_at)} · <span className="text-faint">Bitiş:</span> {formatDate(record.end_at)}</div><div><span className="text-faint">Teknisyen kaynağı:</span> {stringValue(record.technician_source, "internal")}{record.external_service_name ? ` · ${stringValue(record.external_service_name)}` : ""}</div>{collaborators && <div><span className="text-faint">Diğer çalışanlar:</span> {collaborators}</div>}</div>}</div>;
    })}</div>;
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

function detailHref(intent?: string): string | null {
  if (intent === "technician_performance") return "/teknisyen-raporu";
  if (intent === "engine_history") return "/rapor";
  if (intent === "overdue") return "/dashboard";
  if (intent === "maintenance_forecast") return "/tahmin";
  if (intent === "external_service") return "/kayitlar";
  return null;
}

export default function AssistantPage() {
  const { user, loading } = useCurrentUser();
  const searchParams = useSearchParams();
  const initialQuestion = searchParams.get("question")?.trim() || "";
  const shouldAutoSend = searchParams.get("auto") === "1";
  const autoSentQuestionRef = useRef("");
  const pendingAnswerIdRef = useRef<string | null>(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", role: "assistant", text: "Merhaba. AGM Bakım raporlarından salt okunur özetler hazırlayabilirim. Kayıt oluşturamam, değiştiremem veya silemem.", title: "Bakım Asistanı" },
  ]);

  const canAsk = useMemo(() => Boolean(user) && !sending, [sending, user]);

  useEffect(() => {
    if (sending || !pendingAnswerIdRef.current) return;
    const answerId = pendingAnswerIdRef.current;
    const target = document.getElementById(answerId);
    if (!target) return;
    pendingAnswerIdRef.current = null;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending]);

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

  function updateForecastExcludedTypes(messageId: string, excludedTypes: string[]) {
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId || !message.data || message.intent !== "maintenance_forecast") return message;
      const nextData = { ...message.data, excluded_type_labels: [...new Set(excludedTypes)] };
      return { ...message, data: nextData, exportQuery: buildExportQuery(message.intent, message.period, message.dateRange, nextData) };
    }));
  }

  async function ask(value: string) {
    const nextQuestion = value.trim();
    if (!nextQuestion || !canAsk) return;
    const answerId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingAnswerIdRef.current = answerId;
    setQuestion("");
    setSending(true);
    const userMessage: AssistantMessage = { id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: "user", text: nextQuestion };
    setMessages((current) => [...current, userMessage]);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: nextQuestion }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setMessages((current) => [...current, { id: answerId, role: "assistant", text: payload.message || payload.error || "Asistan şu anda yanıt veremiyor.", error: true }]);
        return;
      }
      setMessages((current) => [...current, { id: answerId, role: "assistant", text: payload.summary || "Sonuç hazırlandı.", title: payload.title, data: payload.data, intent: payload.meta?.intent, question: nextQuestion, period: payload.meta?.period, dateRange: payload.meta?.date_range, generatedAt: payload.meta?.generated_at, exportQuery: buildExportQuery(payload.meta?.intent, payload.meta?.period, payload.meta?.date_range, payload.data) }]);
    } catch {
      setMessages((current) => [...current, { id: answerId, role: "assistant", text: "Asistan isteği tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.", error: true }]);
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

  return <div className="assistant-shell min-h-screen min-w-0 max-w-full overflow-x-hidden pb-20"><TopBar title="Bakım Asistanı" subtitle="Salt okunur rapor yardımcısı" /><main className="mx-auto flex min-w-0 w-full max-w-4xl flex-col gap-4 px-4 py-4"><div className="rounded-card border border-amber/30 bg-gradient-to-br from-panel to-panel2 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-base font-extrabold text-text">Raporlarını sor</div><p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">Asistan AGM Bakım’daki rapor, motor saati/yükü, bakım planları, karter basıncı, yağ analizleri, teknik kartlar, teknisyenler ve kendi bildirimlerin gibi güvenli verileri okur. Kayıt oluşturmaz, düzenlemez, silmez ve teknisyen atamaz.</p></div><span className="flex-shrink-0 rounded-full border border-green/30 bg-green/10 px-2.5 py-1 text-[9px] font-bold text-green">SALT OKUNUR</span></div></div><section aria-label="Hızlı sorular"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Hızlı sorular</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{QUICK_QUESTIONS.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={!canAsk} className="flex min-h-[52px] w-full items-center justify-start rounded-xl border border-border bg-panel px-3 py-2.5 text-left text-[10px] font-semibold leading-4 text-muted transition hover:border-amber/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-50">{item}</button>)}</div></section><section aria-label="Asistan konuşması" className="flex min-w-0 max-w-full flex-col gap-3">{messages.map((message) => <div key={message.id} id={message.id} className={`scroll-mt-24 flex min-w-0 max-w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`assistant-result min-w-0 w-full max-w-full rounded-card border p-3.5 ${message.role === "user" ? "border-amber/30 bg-amber/10 sm:max-w-xl" : message.error ? "border-red/30 bg-red/5" : "border-border bg-panel"}`}><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-faint">{message.role === "user" ? "Sen" : message.title || "Bakım Asistanı"}</div>{message.role === "assistant" && message.intent && <span className="text-[9px] text-faint">{message.dateRange ? `${formatDateOnly(message.dateRange.from)} – ${formatDateOnly(message.dateRange.to)}` : message.period === "month" ? "Bu ay" : message.period === "3months" ? "Son 3 ay" : message.period === "year" ? "Bu yıl" : "Tümü"}</span>}</div><div className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5 text-text">{message.text}</div>{message.role === "assistant" && message.question && !message.error && <ExportActions question={message.question} exportQuery={message.exportQuery} />}{message.data && message.intent && <AppliedFilters data={message.data} dateRange={message.dateRange} />}{message.data && message.intent && <ResultDetails data={message.data} intent={message.intent} onForecastExcludedTypesChange={message.intent === "maintenance_forecast" ? (excludedTypes) => updateForecastExcludedTypes(message.id, excludedTypes) : undefined} />}{message.role === "assistant" && message.intent && detailHref(message.intent) && <Link href={detailHref(message.intent)!} className="mt-3 inline-flex text-[10px] font-bold text-amber hover:underline">Detay raporunu aç →</Link>}{message.generatedAt && <div className="mt-2 text-[9px] text-faint">Rapor verisi: {formatDate(message.generatedAt)}</div>}</div></div>)}{sending && <div className="flex justify-start"><div className="rounded-card border border-border bg-panel px-3.5 py-3 text-[11px] text-muted">Raporlar okunuyor...</div></div>}</section><form onSubmit={submit} className="assistant-question-bar sticky bottom-16 z-10 min-w-0 max-w-full rounded-card border border-border bg-bg/95 p-2 shadow-xl backdrop-blur"><div className="flex gap-2"><VoiceInputButton disabled={!canAsk} onTranscript={(text) => setQuestion((current) => `${current.trim()}${current.trim() ? " " : ""}${text.trim()}`.slice(0, 300))} /><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleKeyDown} maxLength={300} disabled={!canAsk} placeholder="Örn. Bu ay kaç bakım yapıldı?" aria-label="Bakım asistanına soru yazın" className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-3 py-2.5 text-[12px] text-text outline-none placeholder:text-faint focus:border-amber/60" /><button type="submit" disabled={!canAsk || !question.trim()} className="rounded-xl bg-amber px-4 py-2.5 text-[11px] font-bold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{sending ? "..." : "Sor"}</button></div><div className="mt-1 px-1 text-right text-[9px] text-faint">{question.length}/300 · Yalnızca rapor okuma</div></form></main><BottomNav /></div>;
}
