interface CompletionWorkspaceHeaderProps {
  isOnline: boolean;
  step: number;
}

const STEPS = ["Motor", "Zaman", "Kontrol", "Kanıt", "Kaydet"];

export default function CompletionWorkspaceHeader({ isOnline, step }: CompletionWorkspaceHeaderProps) {
  return (
    <div className="mb-4 border-b border-border pb-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber">Kayıt çalışma alanı</div>
          <h1 className="text-xl font-extrabold tracking-tight text-text md:text-2xl">Bakım kaydını tamamla</h1>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">Motor, bakım zamanı, ekip katkısı ve kanıtları tek ekranda kontrol ederek kaydı güvenle tamamlayın.</p>
        </div>
        <div className={`w-fit rounded-full border px-3 py-1.5 text-[10px] font-bold ${isOnline ? "border-green/30 bg-green/10 text-green" : "border-amber/40 bg-amber/10 text-amber"}`}>
          {isOnline ? "ÇEVRİMİÇİ" : "ÇEVRİMDIŞI ÇALIŞMA"}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1" aria-label={`Bakım formu adım ${step} / ${STEPS.length}`}>
        {STEPS.map((label, index) => {
          const number = index + 1;
          const complete = number < step;
          const active = number === step;
          return <div key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-extrabold ${complete || active ? "border-amber bg-amber text-on-amber" : "border-border bg-panel2 text-faint"}`}>{complete ? "" : number}</span>
            <span className={`hidden truncate text-[9px] font-bold sm:block ${active ? "text-amber" : complete ? "text-teal" : "text-faint"}`}>{label}</span>
            {number < STEPS.length && <span className={`h-px min-w-2 flex-1 ${complete ? "bg-amber/60" : "bg-border"}`} />}
          </div>;
        })}
      </div>
    </div>
  );
}
