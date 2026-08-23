"use client";

import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import Link from "next/link";
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
  generatedAt?: string;
  error?: boolean;
}

const QUICK_QUESTIONS = [
  "Bu ay kaç bakım yapıldı?",
  "Hangi bakımlar gecikmiş?",
  "Motor 03'ün bakım geçmişi nedir?",
  "Teknisyen performansı nasıl?",
  "Garanti kapsamında dış servise giden motorlar hangileri?",
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

function stringValue(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function ResultDetails({ data, intent }: { data: Record<string, unknown>; intent?: string }) {
  const overdueItems = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  const records = Array.isArray(data.records) ? data.records as Array<Record<string, unknown>> : [];
  const technicians = Array.isArray(data.technicians) ? data.technicians as Array<Record<string, unknown>> : [];
  const services = Array.isArray(data.services) ? data.services as Array<Record<string, unknown>> : [];
  const engines = Array.isArray(data.engines) ? data.engines as Array<Record<string, unknown>> : [];
  const byEngine = Array.isArray(data.by_engine) ? data.by_engine as Array<Record<string, unknown>> : [];
  const byType = Array.isArray(data.by_type) ? data.by_type as Array<Record<string, unknown>> : [];
  const examples = Array.isArray(data.examples) ? data.examples.filter((item): item is string => typeof item === "string") : [];

  if (examples.length > 0) {
    return <div className="mt-3 grid gap-1.5">{examples.map((example) => <div key={example} className="rounded-lg border border-border bg-panel2 px-2.5 py-2 text-[10.5px] text-muted">{example}</div>)}</div>;
  }

  if (overdueItems.length > 0) {
    return <div className="mt-3 grid gap-2">{overdueItems.map((item) => <div key={`${String(item.engine_id)}-${String(item.type_key)}`} className="rounded-lg border border-red/25 bg-red/5 p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(item.engine)}</div><div className="mt-0.5 truncate text-[10px] text-muted">{stringValue(item.type)}</div></div><span className="flex-shrink-0 rounded-full bg-red/10 px-2 py-1 text-[9px] font-bold text-red">{Number(item.overdue_hours || 0).toLocaleString("tr-TR")} sa gecikme</span></div></div>)}</div>;
  }

  if (records.length > 0) {
    return <div className="mt-3 grid gap-2">{records.slice(0, 8).map((record) => <div key={String(record.id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-start justify-between gap-2"><div><div className="text-[11px] font-bold text-text">{stringValue(record.type)}</div><div className="mt-0.5 text-[10px] text-muted">{stringValue(record.technician)}</div></div><div className="text-right text-[9.5px] text-faint">{formatDate(record.created_at)}<br />{formatMinutes(record.duration_minutes)}</div></div><div className="mt-2 text-[9.5px] text-faint">Motor saati: {Number(record.hour_at_completion || 0).toLocaleString("tr-TR")} · Başlangıç: {formatDate(record.start_at)}</div></div>)}</div>;
  }

  if (technicians.length > 0) {
    return <div className="mt-3 grid gap-2">{technicians.slice(0, 8).map((technician) => <div key={String(technician.technician_id)} className="rounded-lg border border-border bg-panel2 p-2.5"><div className="flex items-center justify-between gap-2"><div className="truncate text-[11px] font-bold text-text">{stringValue(technician.technician)}</div><div className="font-mono text-[10px] font-bold text-amber">{Number(technician.responsible_count || 0) + Number(technician.support_count || 0)} görev</div></div><div className="mt-1.5 grid grid-cols-3 gap-2 text-[9px] text-faint"><span>Sorumlu: <b className="text-muted">{Number(technician.responsible_count || 0)}</b></span><span>Destek: <b className="text-muted">{Number(technician.support_count || 0)}</b></span><span>Süre: <b className="text-muted">{formatMinutes(technician.duration_minutes)}</b></span></div></div>)}</div>;
  }

  if (services.length > 0 || engines.length > 0) {
    return <div className="mt-3 grid gap-2">{services.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Servisler</div>{services.map((service) => <div key={String(service.service)} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"><span className="truncate text-[10.5px] text-muted">{stringValue(service.service)}</span><span className="font-mono text-[10px] text-text">{Number(service.count || 0)} kayıt</span></div>)}</div>}{engines.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Motorlar</div>{engines.map((engine) => <div key={String(engine.engine_id)} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"><span className="truncate text-[10.5px] text-muted">{stringValue(engine.engine)}</span><span className="font-mono text-[10px] text-text">{Number(engine.count || 0)} kayıt</span></div>)}</div>}</div>;
  }

  if (byEngine.length > 0 || byType.length > 0) {
    return <div className="mt-3 grid gap-2 sm:grid-cols-2">{byEngine.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Motor dağılımı</div>{byEngine.map((row) => <div key={String(row.engine_id)} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"><span className="truncate text-[10.5px] text-muted">{stringValue(row.engine)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)}</span></div>)}</div>}{byType.length > 0 && <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Bakım türü</div>{byType.map((row) => <div key={String(row.type)} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"><span className="truncate text-[10.5px] text-muted">{stringValue(row.type)}</span><span className="font-mono text-[10px] text-text">{Number(row.count || 0)}</span></div>)}</div>}</div>;
  }

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
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", role: "assistant", text: "Merhaba. AGM Bakım raporlarından salt okunur özetler hazırlayabilirim. Kayıt oluşturamam, değiştiremem veya silemem.", title: "Bakım Asistanı" },
  ]);

  const canAsk = useMemo(() => Boolean(user) && !sending, [sending, user]);

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
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: payload.summary || "Sonuç hazırlandı.", title: payload.title, data: payload.data, intent: payload.meta?.intent, period: payload.meta?.period, generatedAt: payload.meta?.generated_at }]);
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

  return <div className="min-h-screen pb-20"><TopBar title="Bakım Asistanı" subtitle="Salt okunur rapor yardımcısı" /><main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4"><div className="rounded-card border border-amber/30 bg-gradient-to-br from-panel to-panel2 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-base font-extrabold text-text">Raporlarını sor</div><p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">Asistan yalnızca AGM Bakım’daki rapor ve bakım verilerini okur. Kayıt oluşturmaz, düzenlemez, silmez ve teknisyen atamaz.</p></div><span className="flex-shrink-0 rounded-full border border-green/30 bg-green/10 px-2.5 py-1 text-[9px] font-bold text-green">SALT OKUNUR</span></div></div><section aria-label="Hızlı sorular"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">Hızlı sorular</div><div className="flex gap-2 overflow-x-auto pb-1">{QUICK_QUESTIONS.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={!canAsk} className="flex-shrink-0 rounded-full border border-border bg-panel px-3 py-2 text-[10px] font-semibold text-muted transition hover:border-amber/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-50">{item}</button>)}</div></section><section aria-label="Asistan konuşması" className="flex flex-col gap-3">{messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`w-full max-w-3xl rounded-card border p-3.5 ${message.role === "user" ? "border-amber/30 bg-amber/10 sm:max-w-xl" : message.error ? "border-red/30 bg-red/5" : "border-border bg-panel"}`}><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-faint">{message.role === "user" ? "Sen" : message.title || "Bakım Asistanı"}</div>{message.role === "assistant" && message.intent && <span className="text-[9px] text-faint">{message.period === "month" ? "Bu ay" : message.period === "3months" ? "Son 3 ay" : message.period === "year" ? "Bu yıl" : "Tümü"}</span>}</div><div className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5 text-text">{message.text}</div>{message.data && message.intent && <ResultDetails data={message.data} intent={message.intent} />}{message.role === "assistant" && message.intent && detailHref(message.intent) && <Link href={detailHref(message.intent)!} className="mt-3 inline-flex text-[10px] font-bold text-amber hover:underline">Detay raporunu aç →</Link>}{message.generatedAt && <div className="mt-2 text-[9px] text-faint">Rapor verisi: {formatDate(message.generatedAt)}</div>}</div></div>)}{sending && <div className="flex justify-start"><div className="rounded-card border border-border bg-panel px-3.5 py-3 text-[11px] text-muted">Raporlar okunuyor...</div></div>}</section><form onSubmit={submit} className="sticky bottom-16 z-10 rounded-card border border-border bg-bg/95 p-2 shadow-xl backdrop-blur"><div className="flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleKeyDown} maxLength={300} disabled={!canAsk} placeholder="Örn. Bu ay kaç bakım yapıldı?" aria-label="Bakım asistanına soru yazın" className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-3 py-2.5 text-[12px] text-text outline-none placeholder:text-faint focus:border-amber/60" /><button type="submit" disabled={!canAsk || !question.trim()} className="rounded-xl bg-amber px-4 py-2.5 text-[11px] font-bold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{sending ? "..." : "Sor"}</button></div><div className="mt-1 px-1 text-right text-[9px] text-faint">{question.length}/300 · Yalnızca rapor okuma</div></form></main><BottomNav /></div>;
}
