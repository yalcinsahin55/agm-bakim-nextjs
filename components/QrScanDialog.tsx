"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";

interface QrScanDialogProps {
  open: boolean;
  onClose: () => void;
  onDetected: (target: string) => void;
}

function normalizeScanTarget(rawValue: string): string | null {
  try {
    const url = new URL(rawValue.trim(), window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== "/tamamla") return null;
    const engineId = url.searchParams.get("engine_id")?.trim() || "";
    const typeKey = url.searchParams.get("type_key")?.trim() || "";
    if (!engineId && !typeKey) return null;
    const params = new URLSearchParams();
    if (engineId) params.set("engine_id", engineId.slice(0, 120));
    if (typeKey) params.set("type_key", typeKey.slice(0, 120));
    params.set("mode", "quick");
    params.set("plant_id", "avcikoru");
    return `/tamamla?${params.toString()}`;
  } catch {
    return null;
  }
}

export default function QrScanDialog({ open, onClose, onDetected }: QrScanDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setScanning(true);
    controlsRef.current?.stop();
    controlsRef.current = null;
    const reader = new BrowserQRCodeReader();
    const video = videoRef.current;
    if (!video) return () => { cancelled = true; };

    reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: "environment" } } },
      video,
      (result) => {
        if (cancelled || !result) return;
        const target = normalizeScanTarget(result.getText());
        if (!target) {
          setError("Bu QR kod AGM Bakım motor veya bakım bağlantısı değil.");
          return;
        }
        cancelled = true;
        controlsRef.current?.stop();
        controlsRef.current = null;
        setScanning(false);
        onDetectedRef.current(target);
      },
    ).then((controls) => {
      if (cancelled) controls.stop();
      else controlsRef.current = controls;
    }).catch(() => {
      if (cancelled) return;
      setScanning(false);
      setError("Kamera açılamadı. Tarayıcı kamera iznini kontrol edip tekrar dene.");
    });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setScanning(false);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="qr-scan-title" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-panel p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber">Teknisyen hızlı erişim</div>
            <h2 id="qr-scan-title" className="mt-0.5 text-base font-extrabold text-text">QR kod okut</h2>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg border border-border text-muted transition hover:bg-panel2 hover:text-text" aria-label="QR okutmayı kapat">✕</button>
        </div>
        <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-black aspect-square">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="QR kod kamera görüntüsü" />
          <div className="pointer-events-none absolute inset-10 rounded-2xl border-2 border-amber/80" />
          {!scanning && !error && <div className="absolute inset-0 flex items-center justify-center bg-black/50 px-5 text-center text-[11px] text-white">Kamera hazırlanıyor...</div>}
        </div>
        <p className="mt-3 text-[10.5px] leading-relaxed text-muted">Motor veya bakım türü etiketini çerçeveye al. Okutulduğunda Bakım Tamamla ekranı seçilen bilgiyle açılır.</p>
        {error && <div className="mt-3 rounded-lg border border-red/35 bg-red/10 px-3 py-2.5 text-[10.5px] leading-relaxed text-red" role="alert">{error}</div>}
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-lg border border-border bg-panel2 py-2.5 text-[11px] font-bold text-text transition hover:bg-border">Vazgeç</button>
      </div>
    </div>
  );
}
