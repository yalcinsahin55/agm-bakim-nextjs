import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { DashboardAssistantAnswer } from "../_lib/types";
import { DASHBOARD_ASSISTANT_QUICK_QUESTIONS } from "../_lib/types";

export default function DashboardAssistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<DashboardAssistantAnswer | null>(null);
  const [sending, setSending] = useState(false);

  async function ask(rawQuestion: string) {
    const nextQuestion = rawQuestion.trim();
    if (!nextQuestion || sending) return;
    setQuestion(nextQuestion);
    setAnswer(null);
    setSending(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setAnswer({ question: nextQuestion, title: "Bakım Asistanı", summary: payload.message || payload.error || "Asistan şu anda yanıt veremiyor.", error: true });
        return;
      }
      setAnswer({ question: nextQuestion, title: payload.title || "Bakım Asistanı", summary: payload.summary || "Sonuç hazırlandı." });
    } catch {
      setAnswer({ question: nextQuestion, title: "Bakım Asistanı", summary: "Asistan isteği tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.", error: true });
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return <div className="mb-4 rounded-card border border-teal/30 bg-gradient-to-br from-teal/10 via-panel to-panel p-4 animate-fade-in">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><div className="text-[14px] font-extrabold text-text">Bakım Asistanı</div><div className="mt-0.5 text-[11px] leading-5 text-muted">Dashboard’dan çıkmadan bakım raporlarını sor; yanıtı burada gör.</div></div>
      <span className="flex-shrink-0 rounded-full border border-green/30 bg-green/10 px-2 py-1 text-[9px] font-bold text-green">SALT OKUNUR</span>
    </div>
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={300} disabled={sending} placeholder="Örn. Bu ay kaç bakım yapıldı?" aria-label="Dashboard bakım asistanına soru yazın" className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-3 py-2.5 text-[11px] text-text outline-none placeholder:text-faint focus:border-teal/60 disabled:opacity-60" />
      <button type="submit" disabled={sending || !question.trim()} className="rounded-xl bg-teal px-3.5 py-2.5 text-[10.5px] font-extrabold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{sending ? "..." : "Sor"}</button>
    </form>
    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {DASHBOARD_ASSISTANT_QUICK_QUESTIONS.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={sending} className="flex min-h-[44px] w-full items-center justify-start rounded-xl border border-border bg-panel2 px-2.5 py-2 text-left text-[9.5px] font-semibold leading-4 text-muted transition hover:border-teal/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-50">{item}</button>)}
    </div>
    {sending && <div className="mt-3 rounded-lg border border-teal/20 bg-panel2 px-3 py-2 text-[10.5px] text-muted" role="status" aria-live="polite">Raporlar okunuyor...</div>}
    {answer && !sending && <div className={`mt-3 rounded-lg border p-3 ${answer.error ? "border-red/30 bg-red/5" : "border-teal/20 bg-panel2"}`} role={answer.error ? "alert" : "status"}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-faint">{answer.title}</div>
      <div className="mt-1 text-[11.5px] leading-5 text-text">{answer.summary}</div>
      {!answer.error && <Link href={`/asistan?question=${encodeURIComponent(answer.question)}&auto=1`} className="mt-2 inline-flex text-[10px] font-bold text-teal hover:underline">Detaylı cevabı aç →</Link>}
    </div>}
    <div className="mt-2 text-[9px] text-faint">Yalnızca rapor verileri okunur; kayıt değişikliği yapılmaz.</div>
  </div>;
}
