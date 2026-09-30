"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";

type Issue = { key: string; label: string; count: number; severity: string; rows: unknown[] };
type Report = { generated_at: string; total_issues: number; issues: Issue[] };

export default function DataQualityPage() {
  const { user, loading: userLoading } = useCurrentUser();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/data-quality", { cache: "no-store" });
      const data = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(data.error || "Veri kalite raporu alınamadı.");
      setReport(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Veri kalite raporu alınamadı.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!userLoading && user?.role === "yonetici") void load(); }, [userLoading, user]);

  return <div className="min-h-screen bg-bg text-text"><Sidebar /><div className="md:pl-64"><TopBar title="Veri Kalite Merkezi" subtitle="Motor, bakım ve saat geçmişi tutarlılık kontrolleri" /><main className="mx-auto max-w-6xl p-4 pb-24 sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3"><div><h1 className="text-lg font-extrabold">Veri kalite raporu</h1><p className="mt-1 text-xs text-muted">Bulunan sorunlar kayıtları otomatik değiştirmez; düzeltme öncesi inceleme için listelenir.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-border bg-panel px-3 py-2 text-xs font-bold text-muted hover:border-amber/50 disabled:opacity-50">{loading ? "Kontrol ediliyor…" : "Yenile"}</button></div>
    {error && <div className="mb-4 rounded-xl border border-red/30 bg-red/10 p-3 text-sm text-red">{error}</div>}
    {loading && !report ? <div className="rounded-2xl border border-border bg-panel p-6 text-sm text-muted">Kontroller çalıştırılıyor…</div> : report && <><div className={`mb-4 rounded-2xl border p-5 ${report.total_issues ? "border-amber/30 bg-amber/10" : "border-green/30 bg-green/10"}`}><div className="text-3xl font-black">{report.total_issues}</div><div className="mt-1 text-sm font-bold">{report.total_issues ? "İncelenmesi gereken veri kalite bulgusu" : "Veri kalite bulgusu yok"}</div><div className="mt-1 text-xs text-muted">Son kontrol: {new Date(report.generated_at).toLocaleString("tr-TR")}</div></div><div className="grid gap-3 md:grid-cols-2">{report.issues.map((issue) => <section key={issue.key} className="rounded-2xl border border-border bg-panel p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-extrabold">{issue.label}</h2><p className="mt-1 text-xs text-muted">{issue.severity === "high" ? "Yüksek öncelik" : "Kontrol edilmesi önerilir"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${issue.count ? "bg-red/15 text-red" : "bg-green/15 text-green"}`}>{issue.count}</span></div>{issue.rows.length > 0 && <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-bg/60 p-3 text-[10px] text-muted">{JSON.stringify(issue.rows, null, 2)}</pre>}</section>)}</div></>}
  </main><BottomNav /></div></div>;
}
