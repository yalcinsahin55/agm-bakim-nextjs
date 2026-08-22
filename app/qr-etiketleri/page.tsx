"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useRouter } from "next/navigation";

type Engine = {
  _id: string;
  name: string;
};

type QrImageMap = Record<string, string>;

export default function QrEtiketleriPage() {
  const router = useRouter();
  const [engines, setEngines] = useState<Engine[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [qrImages, setQrImages] = useState<QrImageMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/engines")
      .then(async (response) => {
        if (response.status === 401) {
          router.push(`/login?redirect=${encodeURIComponent("/qr-etiketleri")}`);
          return null;
        }
        if (!response.ok) throw new Error("Motorlar yüklenemedi.");
        return response.json() as Promise<Engine[]>;
      })
      .then((data) => {
        if (!active || !data) return;
        const list = Array.isArray(data) ? data : [];
        setEngines(list);
        setSelected(list.map((engine) => engine._id));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Motorlar yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!engines.length) return;
    let active = true;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    Promise.all(engines.map(async (engine) => {
      const value = `${origin}/tamamla?engine_id=${encodeURIComponent(engine._id)}&mode=quick&plant_id=avcikoru`;
      const dataUrl = await QRCode.toDataURL(value, {
        width: 420,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#0c1117", light: "#ffffff" },
      });
      return [engine._id, dataUrl] as const;
    }))
      .then((entries) => {
        if (active) setQrImages(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setError("QR kodları oluşturulamadı.");
      });
    return () => { active = false; };
  }, [engines]);

  const selectedEngines = useMemo(
    () => engines.filter((engine) => selected.includes(engine._id)),
    [engines, selected],
  );

  function toggleEngine(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectAll() {
    setSelected(selected.length === engines.length ? [] : engines.map((engine) => engine._id));
  }

  function printLabels() {
    if (!selectedEngines.length) return;
    window.print();
  }

  if (loading) {
    return (
      <div>
        <TopBar title="QR Etiketleri" subtitle="Motor etiketleri hazırlanıyor..." />
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="no-print">
        <TopBar title="QR Etiketleri" subtitle={`${selectedEngines.length}/${engines.length} etiket seçildi`} />
        <main className="px-4 py-4 max-w-5xl mx-auto">
          <section className="bg-panel border border-border rounded-2xl p-4 mb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h1 className="text-base font-extrabold text-text">Motor QR etiketleri</h1>
                <p className="text-[11px] text-muted mt-1 leading-relaxed">
                  Etiketleri seç, ardından yazdır. Yazdırma ekranında bilgisayarda “PDF olarak kaydet”, telefonda ise paylaş/yazdır menüsünü kullanabilirsin.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={selectAll} className="px-3 py-2 rounded-lg border border-border text-[11px] font-bold text-muted hover:bg-panel2 transition">
                  {selected.length === engines.length ? "Seçimi kaldır" : "Tümünü seç"}
                </button>
                <button type="button" onClick={printLabels} disabled={!selectedEngines.length} className="px-3 py-2 rounded-lg bg-amber text-[#161006] text-[11px] font-extrabold disabled:opacity-40 hover:brightness-110 transition">
                  Yazdır / PDF al
                </button>
              </div>
            </div>
          </section>

          {error && <div className="mb-4 rounded-xl border border-red/40 bg-red/10 px-3 py-2.5 text-[11px] text-red">{error}</div>}

          <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 no-print" aria-label="Motor seçimi">
            {engines.map((engine) => {
              const checked = selected.includes(engine._id);
              return (
                <label key={engine._id} className={`flex items-center gap-3 rounded-xl border px-3 py-3 cursor-pointer transition ${checked ? "border-amber/50 bg-amber/10" : "border-border bg-panel"}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleEngine(engine._id)} />
                  <span className="text-sm font-bold text-text truncate">{engine.name}</span>
                </label>
              );
            })}
          </section>

          {engines.length === 0 && <div className="text-center py-12 text-sm text-muted">Henüz motor bulunmuyor.</div>}
        </main>
      </div>

      <section className="qr-sheet" aria-label="Yazdırılabilir QR etiketleri">
        {selectedEngines.map((engine) => (
          <article className="qr-label" key={engine._id}>
            <div className="qr-label-brand">AVCIKORU SANTRALİ</div>
            <div className="qr-label-title">{engine.name}</div>
            <div className="qr-label-subtitle">Hızlı bakım başlatmak için okutun</div>
            <div className="qr-image-wrap">
              {qrImages[engine._id] ? <img src={qrImages[engine._id]} alt={`${engine.name} QR kodu`} /> : <div className="qr-loading">QR hazırlanıyor...</div>}
            </div>
            <div className="qr-label-footer">Motor bakım takip sistemi</div>
          </article>
        ))}
      </section>

      <BottomNav />

      <style jsx global>{`
        .qr-sheet { display: none; }
        .qr-label { box-sizing: border-box; background: #fff; color: #10151b; border: 1px solid #b7c0c8; border-radius: 10px; padding: 12px; text-align: center; break-inside: avoid; }
        .qr-label-brand { color: #586673; font-size: 9px; font-weight: 800; letter-spacing: .14em; }
        .qr-label-title { font-size: 18px; line-height: 1.1; font-weight: 900; margin-top: 4px; }
        .qr-label-subtitle { color: #586673; font-size: 9px; margin-top: 4px; }
        .qr-image-wrap { min-height: 170px; display: flex; align-items: center; justify-content: center; margin-top: 8px; }
        .qr-image-wrap img { width: 170px; height: 170px; image-rendering: pixelated; }
        .qr-loading { color: #586673; font-size: 10px; }
        .qr-label-footer { color: #586673; font-size: 8px; margin-top: 6px; }
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: #fff !important; }
          .no-print, nav, aside, header, footer { display: none !important; }
          .qr-sheet { display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 6mm; align-items: start; }
          .qr-label { min-height: 78mm; }
        }
      `}</style>
    </div>
  );
}
