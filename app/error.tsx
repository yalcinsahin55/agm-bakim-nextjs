"use client";

export default function Error({ error, reset }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="text-center bg-panel border border-border rounded-card p-6 max-w-sm w-full animate-fade-in">
        <div className="text-4xl mb-3">⚠️</div>
        <div className="font-display text-xl font-bold uppercase tracking-wide mb-1">Bir şeyler ters gitti</div>
        <p className="text-[12px] text-muted mb-4 leading-relaxed">
          Sayfa yüklenirken beklenmeyen bir hata oluştu. Tekrar deneyebilirsin.
        </p>
        <button
          onClick={reset}
          className="w-full py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] shadow-lg hover:brightness-110 active:scale-[.98] transition"
        >
          🔄 Tekrar Dene
        </button>
        <a
          href="/dashboard"
          className="block mt-2 py-2.5 rounded-xl border border-border text-muted text-[12.5px] font-bold hover:bg-panel2 transition"
        >
          Özet Sayfasına Dön
        </a>
      </div>
    </div>
  );
}
