import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="text-center animate-fade-in">
        <div className="font-mono text-6xl font-bold text-amber mb-2">404</div>
        <div className="font-display text-xl font-bold uppercase tracking-wide mb-1">Sayfa bulunamadı</div>
        <p className="text-[12.5px] text-muted mb-5">Aradığın sayfa taşınmış veya hiç var olmamış olabilir.</p>
        <Link
          href="/dashboard"
          className="inline-block px-5 py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] shadow-lg hover:brightness-110 transition"
        >
          🏠 Özet Sayfasına Dön
        </Link>
      </div>
    </div>
  );
}
