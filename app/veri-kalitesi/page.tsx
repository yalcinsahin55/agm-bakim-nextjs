"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
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

  useEffect(() => {
    if (!userLoading && user?.role === "yonetici") void load();
  }, [userLoading, user]);

  return (
    <div>
      <TopBar title="Veri Kalite Merkezi" subtitle="Motor, bakım ve saat geçmişi tutarlılık kontrolleri" />
      <main className="mx-auto w-full max-w-5xl px-4 py-4 pb-28 sm:px-6 md:px-8">
        <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold uppercase tracking-wide sm:text-2xl">Veri kalite raporu</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              Bulunan sorunlar kayıtları otomatik değiştirmez; düzeltme öncesi inceleme için listelenir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="ui-button ui-button-secondary w-full shrink-0 sm:w-auto"
          >
            {loading ? "Kontrol ediliyor…" : "Yenile"}
          </button>
        </div>

        {error && <div className="mb-4 rounded-control border border-red/30 bg-red/10 p-3 text-sm text-red" role="alert">{error}</div>}

        {loading && !report ? (
          <div className="ui-card p-5 text-sm text-muted sm:p-6">Kontroller çalıştırılıyor…</div>
        ) : report ? (
          <>
            <section className={`mb-4 rounded-2xl border p-4 sm:p-5 ${report.total_issues ? "border-amber/30 bg-amber/10" : "border-green/30 bg-green/10"}`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="font-mono text-3xl font-black sm:text-4xl">{report.total_issues}</div>
                  <div className="mt-1 text-sm font-bold">{report.total_issues ? "İncelenmesi gereken veri kalite bulgusu" : "Veri kalite bulgusu yok"}</div>
                </div>
                <div className="text-left text-xs text-muted sm:text-right">
                  Son kontrol<br />
                  <span className="font-mono text-[11px] text-text">{new Date(report.generated_at).toLocaleString("tr-TR")}</span>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {report.issues.map((issue) => (
                <section key={issue.key} className="ui-card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-extrabold leading-snug">{issue.label}</h2>
                      <p className="mt-1 text-xs text-muted">{issue.severity === "high" ? "Yüksek öncelik" : "Kontrol edilmesi önerilir"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${issue.count ? "bg-red/15 text-red" : "bg-green/15 text-green"}`}>
                      {issue.count}
                    </span>
                  </div>
                  {issue.rows.length > 0 && (
                    <pre className="mt-3 max-h-48 overflow-auto rounded-control bg-bg/60 p-3 text-[10px] leading-relaxed text-muted">{JSON.stringify(issue.rows, null, 2)}</pre>
                  )}
                </section>
              ))}
            </div>
          </>
        ) : null}
      </main>
      <BottomNav />
    </div>
  );
}
