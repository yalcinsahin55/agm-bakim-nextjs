"use client";

import { Button, Input } from "@/components/ui";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import AssistantExportPanel from "@/components/AssistantExportPanel";
import AssistantResultDetails, { detailHref } from "@/components/AssistantResultDetails";
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
  "AGM 7 için yapılan bakımlar ve raporları göster.",
  "AGM 7 için bu ay yapılan tüm bakımları göster.",
  "AGM 7'nin Yağ Değişimi bakımı için kaç saat kaldı ve son bakımda ne kadar çalışıldı?",
  "AGM 7 için tüm bakım türlerinde kalan ve çalışılan süreleri göster.",
];


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

  return <div className="flex min-w-[74px] flex-col items-start gap-1"><Button type="button" onClick={toggleListening} disabled={disabled} aria-label={listening ? "Sesli girişi durdur" : "Sesli soru söyle"} aria-pressed={listening} className={`rounded-xl border px-3 py-2.5 text-[10px] font-bold transition ${listening ? "border-red/50 bg-red/10 text-red" : "border-border bg-panel text-muted hover:border-amber/50 hover:text-amber"} disabled:cursor-not-allowed disabled:opacity-50`}>{listening ? "Durdur" : "Mikrofon"}</Button>{status && <span role="status" aria-live="polite" className="max-w-[150px] text-[9px] leading-3 text-faint">{status}</span>}</div>;
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

function buildExportQuery(intent: string | undefined, period: string | undefined, dateRange: { from: string; to: string } | null | undefined, data: Record<string, unknown> | undefined): Record<string, string> {
  const exportableIntents = new Set(["summary", "technician_performance", "external_service", "engine_history", "maintenance_forecast", "engine_data", "maintenance_health"]);
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
  const ask = useCallback(async (value: string) => {
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
  }, [canAsk]);

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
  }, [ask, initialQuestion, loading, shouldAutoSend, user]);

  function updateForecastExcludedTypes(messageId: string, excludedTypes: string[]) {
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId || !message.data || message.intent !== "maintenance_forecast") return message;
      const nextData = { ...message.data, excluded_type_labels: [...new Set(excludedTypes)] };
      return { ...message, data: nextData, exportQuery: buildExportQuery(message.intent, message.period, message.dateRange, nextData) };
    }));
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

  return <div className="assistant-shell min-h-screen min-w-0 max-w-full overflow-x-hidden pb-20"><TopBar title="Bakım Asistanı" subtitle="Salt okunur rapor yardımcısı" /><main className="mx-auto flex min-w-0 w-full max-w-4xl flex-col gap-4 px-4 py-4"><div className="rounded-card border border-amber/30 bg-gradient-to-br from-panel to-panel2 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-base font-extrabold text-text">Raporlarını sor</div><p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">Asistan AGM Bakım’daki rapor, motor saati/yükü, bakım planları, karter basıncı, yağ analizleri, teknik kartlar, teknisyenler ve kendi bildirimlerin gibi güvenli verileri okur. Kayıt oluşturmaz, düzenlemez, silmez ve teknisyen atamaz.</p></div><span className="flex-shrink-0 rounded-full border border-green/30 bg-green/10 px-2.5 py-1 text-[9px] font-bold text-green">SALT OKUNUR</span></div></div><section aria-label="Hızlı sorular"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Hızlı sorular</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{QUICK_QUESTIONS.map((item) => <Button key={item} type="button" onClick={() => void ask(item)} disabled={!canAsk} className="flex min-h-[52px] w-full items-center justify-start rounded-xl border border-border bg-panel px-3 py-2.5 text-left text-[10px] font-semibold leading-4 text-muted transition hover:border-amber/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-50">{item}</Button>)}</div></section><section aria-label="Asistan konuşması" className="flex min-w-0 max-w-full flex-col gap-3">{messages.map((message) => <div key={message.id} id={message.id} className={`scroll-mt-24 flex min-w-0 max-w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`assistant-result min-w-0 w-full max-w-full rounded-card border p-3.5 ${message.role === "user" ? "border-amber/30 bg-amber/10 sm:max-w-xl" : message.error ? "border-red/30 bg-red/5" : "border-border bg-panel"}`}><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-faint">{message.role === "user" ? "Sen" : message.title || "Bakım Asistanı"}</div>{message.role === "assistant" && message.intent && <span className="text-[9px] text-faint">{message.dateRange ? `${formatDateOnly(message.dateRange.from)} – ${formatDateOnly(message.dateRange.to)}` : message.period === "month" ? "Bu ay" : message.period === "3months" ? "Son 3 ay" : message.period === "year" ? "Bu yıl" : "Tümü"}</span>}</div><div className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5 text-text">{message.text}</div>{message.role === "assistant" && message.question && !message.error && message.data && message.intent && <AssistantExportPanel question={message.question} intent={message.intent} data={message.data} exportQuery={message.exportQuery} canManageLogo={user?.role === "yonetici"} />}{message.data && message.intent && <AppliedFilters data={message.data} dateRange={message.dateRange} />}{message.data && message.intent && <AssistantResultDetails data={message.data} intent={message.intent} onForecastExcludedTypesChange={message.intent === "maintenance_forecast" ? (excludedTypes) => updateForecastExcludedTypes(message.id, excludedTypes) : undefined} />}{message.role === "assistant" && message.intent && detailHref(message.intent) && <Link href={detailHref(message.intent)!} className="mt-3 inline-flex text-[10px] font-bold text-amber hover:underline">Detay raporunu aç →</Link>}{message.generatedAt && <div className="mt-2 text-[9px] text-faint">Rapor verisi: {formatDate(message.generatedAt)}</div>}</div></div>)}{sending && <div className="flex justify-start"><div className="rounded-card border border-border bg-panel px-3.5 py-3 text-[11px] text-muted">Raporlar okunuyor...</div></div>}</section><form onSubmit={submit} className="assistant-question-bar sticky bottom-16 z-10 min-w-0 max-w-full rounded-card border border-border bg-bg/95 p-2 shadow-xl backdrop-blur"><div className="flex gap-2"><VoiceInputButton disabled={!canAsk} onTranscript={(text) => setQuestion((current) => `${current.trim()}${current.trim() ? " " : ""}${text.trim()}`.slice(0, 300))} /><Input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleKeyDown} maxLength={300} disabled={!canAsk} placeholder="Örn. Bu ay kaç bakım yapıldı?" aria-label="Bakım asistanına soru yazın" className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-3 py-2.5 text-[12px] text-text outline-none placeholder:text-faint focus:border-amber/60" /><Button type="submit" disabled={!canAsk || !question.trim()} className="rounded-xl bg-amber px-4 py-2.5 text-[11px] font-bold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{sending ? "..." : "Sor"}</Button></div><div className="mt-1 px-1 text-right text-[9px] text-faint">{question.length}/300 · Yalnızca rapor okuma</div></form></main><BottomNav /></div>;
}
