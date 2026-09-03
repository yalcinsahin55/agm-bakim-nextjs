"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TopBar from "@/components/TopBar";
import Skeleton from "@/components/Skeleton";
import { buildQuickMaintenanceLink } from "@/lib/quickMaintenanceLink";
import { usePageData } from "@/lib/usePageData";

type Engine = { _id: string; name: string };
type MaintenanceType = { _id?: string; key: string; label: string };
type QrMode = "engine" | "type";
type QrItem = { id: string; name: string; kind: QrMode };
type QrImageMap = Record<string, string>;

export default function QrEtiketleriPage() {
  const router = useRouter();
  const [mode, setMode] = useState<QrMode>("engine");
  const [selected, setSelected] = useState<string[]>([]);
  const [qrImages, setQrImages] = useState<QrImageMap>({});
  const [qrTarget, setQrTarget] = useState<QrItem | null>(null);
  const [error, setError] = useState("");

  const { data, loading, error: loadError } = usePageData(
    async (signal) => {
      const [engineResponse, typeResponse] = await Promise.all([
        fetch("/api/engines", { signal }),
        fetch("/api/maintenance-types", { signal }),
      ]);
      if (engineResponse.status === 401 || typeResponse.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent("/qr-etiketleri")}`);
        return { engines: [], types: [] };
      }
      if (!engineResponse.ok || !typeResponse.ok) throw new Error("QR verileri yüklenemedi.");
      const [engineData, typeData] = await Promise.all([engineResponse.json(), typeResponse.json()]);
      return {
        engines: Array.isArray(engineData) ? engineData as Engine[] : [],
        types: Array.isArray(typeData) ? typeData as MaintenanceType[] : [],
      };
    },
    { engines: [] as Engine[], types: [] as MaintenanceType[] },
    [router],
    "QR verileri yüklenemedi.",
  );

  const items = useMemo<QrItem[]>(
    () => mode === "engine"
      ? data.engines.map((engine) => ({ id: engine._id, name: engine.name, kind: "engine" }))
      : data.types.map((type) => ({ id: type.key, name: type.label, kind: "type" })),
    [data.engines, data.types, mode],
  );

  useEffect(() => {
    setSelected(items.map((item) => item.id));
  }, [items]);

  function buildLink(item: QrItem): string {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return item.kind === "engine"
      ? buildQuickMaintenanceLink({ origin, engineId: item.id })
      : buildQuickMaintenanceLink({ origin, typeKey: item.id });
  }

  useEffect(() => {
    if (!items.length) {
      setQrImages({});
      return;
    }
    let active = true;
    setQrImages({});
    const batchSize = 12;
    const generate = async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        for (let start = 0; start < items.length; start += batchSize) {
          const batch = items.slice(start, start + batchSize);
          const entries = await Promise.all(batch.map(async (item) => [item.id, await QRCode.toDataURL(buildLink(item), {
            width: 420,
            margin: 2,
            errorCorrectionLevel: "M",
            color: { dark: "#0c1117", light: "#ffffff" },
          })] as const));
          if (!active) return;
          setQrImages((current) => ({ ...current, ...Object.fromEntries(entries) }));
          if (start + batchSize < items.length) await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      } catch {
        if (active) setError("QR kodları oluşturulamadı.");
      }
    };
    void generate();
    return () => { active = false; };
  }, [items]);

  const selectedItems = useMemo(() => items.filter((item) => selected.includes(item.id)), [items, selected]);

  function toggleItem(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectAll() {
    setSelected(selected.length === items.length ? [] : items.map((item) => item.id));
  }

  function printLabels() {
    if (selectedItems.length) window.print();
  }

  async function copyQrLink() {
    if (!qrTarget) return;
    try {
      await navigator.clipboard.writeText(buildLink(qrTarget));
      setError("");
      toast.success("QR bağlantısı kopyalandı.");
    } catch {
      setError("Bağlantı kopyalanamadı.");
      toast.error("QR bağlantısı kopyalanamadı.");
    }
  }

  if (loading) {
    return <div><TopBar title="QR Etiketleri" subtitle="Etiketler hazırlanıyor..." /><div className="grid grid-cols-2 gap-3 px-4 py-4 md:grid-cols-3"><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-44 rounded-xl" /></div></div>;
  }

  return <div className="min-h-screen">
    <div className="no-print">
      <TopBar title="QR Etiketleri" subtitle={`${selectedItems.length}/${items.length} etiket seçildi`} />
      <main className="mx-auto max-w-5xl px-4 py-4">
        <section className="mb-4 rounded-2xl border border-border bg-panel p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-base font-extrabold text-text">Motor veya bakım QR etiketleri</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">Motor QR’ı motoru kilitler. Bakım türü QR’ı ise bakım türünü seçer; teknisyen açılan ekranda motoru seçerek devam eder.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={selectAll} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted transition hover:bg-panel2">{selected.length === items.length ? "Seçimi kaldır" : "Tümünü seç"}</button>
              <button type="button" onClick={printLabels} disabled={!selectedItems.length} className="rounded-lg bg-amber px-3 py-2 text-[11px] font-extrabold text-[#161006] transition hover:brightness-110 disabled:opacity-40">Yazdır / PDF al</button>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-amber/25 bg-amber/5 px-3 py-2 text-[10px] leading-relaxed text-muted">Hizalamanın doğru çıkması için yazdırma penceresinde <strong className="text-amber">Ölçek: %100 / Gerçek boyut</strong> ve <strong className="text-amber">Kenar boşlukları: Yok</strong> seçeneğini kullan.</div>
          <div className="mt-2 rounded-lg border border-teal/25 bg-teal/5 px-3 py-2 text-[10px] leading-relaxed text-muted"><strong className="text-teal">Saha akışı:</strong> Etiketteki QR bağlantısı uygulamaya kamera eklemez; telefonun mevcut QR okuyucusu ile açıldığında Hızlı Bakım ekranına gider. Motor etiketi motoru, bakım türü etiketi bakım türünü önseçer.</div>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-panel2 p-1">
            <button type="button" onClick={() => setMode("engine")} className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${mode === "engine" ? "bg-teal/15 text-teal shadow-sm" : "text-muted"}`}>Motor QR etiketleri</button>
            <button type="button" onClick={() => setMode("type")} className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${mode === "type" ? "bg-amber/15 text-amber shadow-sm" : "text-muted"}`}>Bakım türü QR etiketleri</button>
          </div>
        </section>

        {(loadError || error) && <div className="mb-4 rounded-xl border border-red/40 bg-red/10 px-3 py-2.5 text-[11px] text-red" role="alert">{loadError || error}</div>}
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3" aria-label={mode === "engine" ? "Motor QR seçimi" : "Bakım türü QR seçimi"}>
          {items.map((item) => {
            const checked = selected.includes(item.id);
            return <div key={item.id} className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 py-3 transition ${checked ? (mode === "engine" ? "border-teal/50 bg-teal/10" : "border-amber/50 bg-amber/10") : "border-border bg-panel"}`}><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" checked={checked} onChange={() => toggleItem(item.id)} /><span className="truncate text-sm font-bold text-text">{item.name}</span></label><button type="button" onClick={() => setQrTarget(item)} className="min-h-9 flex-shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-bold text-muted transition hover:border-amber/50 hover:text-amber">Önizle</button></div>;
          })}
        </section>
        {!items.length && <div className="py-12 text-center text-sm text-muted">Bu kategoride veri bulunmuyor.</div>}
      </main>
    </div>

    <section className="qr-sheet" aria-label="Yazdırılabilir QR etiketleri">
      {selectedItems.map((item) => <article className="qr-label" key={item.id}><div className="qr-label-brand">AVCIKORU SANTRALİ</div><div className="qr-label-title">{item.name}</div><div className="qr-label-subtitle">{item.kind === "engine" ? "Hızlı bakım başlatmak için okutun" : "Bu bakımı seçip motoru belirlemek için okutun"}</div><div className="qr-image-wrap">{qrImages[item.id] ? <Image src={qrImages[item.id]} width={170} height={170} unoptimized alt={`${item.name} QR kodu`} /> : <div className="qr-loading">QR hazırlanıyor...</div>}</div><div className="qr-label-footer">{item.kind === "engine" ? "Motor bakım takip sistemi" : "Bakım türü hızlı seçim etiketi"}</div></article>)}
    </section>

    {qrTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={`${qrTarget.name} QR kodu`} onClick={() => setQrTarget(null)}><div className="w-full max-w-sm rounded-2xl border border-border bg-panel p-4 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between"><div className="text-left"><div className="text-[10px] font-bold uppercase tracking-wider text-amber">{qrTarget.kind === "engine" ? "Motor QR Kodu" : "Bakım Türü QR Kodu"}</div><div className="mt-0.5 text-base font-extrabold text-text">{qrTarget.name}</div></div><button type="button" onClick={() => setQrTarget(null)} className="h-8 w-8 rounded-lg border border-border text-muted transition hover:bg-panel2 hover:text-text" aria-label="QR penceresini kapat">✕</button></div><div className="mx-auto flex min-h-[190px] w-fit min-w-[190px] items-center justify-center rounded-xl bg-white p-3">{qrImages[qrTarget.id] ? <Image src={qrImages[qrTarget.id]} width={208} height={208} unoptimized alt={`${qrTarget.name} QR kodu`} className="h-52 w-52" /> : <span className="text-xs text-slate-600">QR hazırlanıyor...</span>}</div><p className="mt-3 text-[11px] leading-relaxed text-muted">{qrTarget.kind === "engine" ? "Bu kod okutulduğunda uygulama doğrudan bu motorun bakım panelini açar." : "Bu kod okutulduğunda bakım türü seçilir; teknisyen sonraki adımda motoru seçer."}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => void copyQrLink()} className="rounded-lg border border-border py-2.5 text-[11px] font-bold text-muted transition hover:bg-panel2">Bağlantıyı kopyala</button><a href={qrImages[qrTarget.id] || undefined} download={`${qrTarget.name.replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "-")}-qr.png`} className={`rounded-lg bg-amber py-2.5 text-[11px] font-extrabold text-[#161006] transition ${qrImages[qrTarget.id] ? "hover:brightness-110" : "pointer-events-none opacity-50"}`}>PNG indir</a></div><button type="button" onClick={() => setQrTarget(null)} className="mt-2 w-full rounded-lg border border-border bg-panel2 py-2.5 text-[11px] font-bold text-text transition hover:bg-border">Kapat</button></div></div>}

    <style jsx global>{`
      .qr-sheet { display: none; }
      .qr-label { box-sizing: border-box; background: #fff; color: #10151b; border: 1px solid #b7c0c8; border-radius: 10px; padding: 12px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
      .qr-label-brand { color: #586673; font-size: 9px; font-weight: 800; letter-spacing: .14em; }
      .qr-label-title { font-size: 18px; line-height: 1.1; font-weight: 900; margin-top: 4px; overflow-wrap: anywhere; }
      .qr-label-subtitle { color: #586673; font-size: 9px; line-height: 1.2; margin-top: 4px; }
      .qr-image-wrap { min-height: 170px; display: flex; align-items: center; justify-content: center; margin-top: 8px; }
      .qr-image-wrap img { display: block; width: 170px; height: 170px; image-rendering: pixelated; }
      .qr-loading { color: #586673; font-size: 10px; }
      .qr-label-footer { color: #586673; font-size: 8px; margin-top: 6px; }
      @media print {
        @page { size: A4 portrait; margin: 0; }
        html, body { width: 210mm; min-width: 210mm; margin: 0 !important; padding: 0 !important; background: #fff !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print, nav, aside, header, footer { display: none !important; }
        .min-h-screen { min-height: 0 !important; padding-bottom: 0 !important; }
        .qr-sheet { display: grid !important; width: 190mm; grid-template-columns: repeat(3, 60mm); grid-auto-rows: 82mm; gap: 5mm; align-items: stretch; justify-content: start; margin: 10mm 10mm 0; padding: 0 !important; }
        .qr-label { width: 60mm; height: 82mm; min-height: 0; border: .25mm solid #9aa5af; border-radius: 2mm; padding: 4mm; overflow: hidden; }
        .qr-label-brand { font-size: 7pt; letter-spacing: .1em; line-height: 1.1; }
        .qr-label-title { font-size: 13pt; line-height: 1.1; margin-top: 1.5mm; max-height: 10mm; overflow: hidden; }
        .qr-label-subtitle { font-size: 7pt; line-height: 1.2; margin-top: 1.5mm; min-height: 7mm; }
        .qr-image-wrap { width: 100%; height: 46mm; min-height: 46mm; margin-top: 2mm; }
        .qr-image-wrap img { width: 44mm; height: 44mm; image-rendering: pixelated; }
        .qr-loading { font-size: 7pt; }
        .qr-label-footer { font-size: 6.5pt; line-height: 1.1; margin-top: 2mm; }
      }
    `}</style>
  </div>;
}
