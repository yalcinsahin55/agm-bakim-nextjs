interface OilAnalysisSummaryProps {
  good: number;
  attention: number;
  bad: number;
}

export default function OilAnalysisSummary({ good, attention, bad }: OilAnalysisSummaryProps) {
  return (
    <section className="mb-3 rounded-card border border-teal/30 bg-teal/5 p-4">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-teal/30 bg-teal/10 text-2xl" aria-hidden="true">🧪</div><div className="min-w-0"><h1 className="font-display text-[14px] font-bold uppercase tracking-wide text-text">Yağ durum özeti</h1><p className="mt-0.5 text-[10.5px] text-muted">Motor yağ analizlerini rapor sonucu ve tarihine göre takip et.</p></div></div>
      <div className="mt-3 grid grid-cols-3 gap-2"><div className="rounded-xl border border-green/30 bg-green/10 px-2.5 py-2"><div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">İyi</div><div className="mt-1 font-mono text-lg font-bold text-green">{good}</div></div><div className="rounded-xl border border-amber/30 bg-amber/10 px-2.5 py-2"><div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">Dikkat</div><div className="mt-1 font-mono text-lg font-bold text-amber">{attention}</div></div><div className="rounded-xl border border-red/30 bg-red/10 px-2.5 py-2"><div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">Kötü</div><div className="mt-1 font-mono text-lg font-bold text-red">{bad}</div></div></div>
    </section>
  );
}
