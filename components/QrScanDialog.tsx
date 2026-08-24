"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";

interface QrScanDialogProps {
  open: boolean;
  onClose: () => void;
  onDetected: (target: string) => void;
}

interface ScannerControls {
  stop: () => void;
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

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Chrome kamera iznini bu site için reddetmiş görünüyor. Adres çubuğundaki kilit simgesinden Kamera → İzin ver seçip sayfayı yenile.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Kullanılabilir bir kamera bulunamadı. Telefon kamerasını kapatıp tekrar dene.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Kamera başka bir uygulama veya sekme tarafından kullanılıyor olabilir. Diğer kamera kullanan uygulamaları kapatıp tekrar dene.";
  }
  if (name === "SecurityError") {
    return "Kamera yalnızca güvenli bağlantıda açılabilir. Uygulamayı https:// bağlantısından açıp tekrar dene.";
  }
  return "Kamera akışı başlatılamadı. Chrome sekmesini yenileyip tekrar dene.";
}

async function requestCamera(): Promise<MediaStream> {
  const preferred = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  } satisfies MediaStreamConstraints;
  try {
    return await navigator.mediaDevices.getUserMedia(preferred);
  } catch (error) {
    if (error instanceof DOMException && error.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
    throw error;
  }
}

export default function QrScanDialog({ open, onClose, onDetected }: QrScanDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let activeStream: MediaStream | null = null;
    setError("");
    setScanning(false);
    controlsRef.current?.stop();
    controlsRef.current = null;
    const reader = new BrowserQRCodeReader();
    const video = videoRef.current;
    if (!video) return () => { cancelled = true; };

    const stopActiveStream = () => {
      activeStream?.getTracks().forEach((track) => track.stop());
      activeStream = null;
      video.pause();
      video.srcObject = null;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Bu tarayıcı kamera erişimini desteklemiyor. Güncel Chrome ile tekrar dene.");
        return;
      }
      if (!window.isSecureContext) {
        setError("Kamera yalnızca güvenli bağlantıda açılabilir. Uygulamayı https:// bağlantısından açıp tekrar dene.");
        return;
      }
      try {
        activeStream = await requestCamera();
        if (cancelled) {
          stopActiveStream();
          return;
        }
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = activeStream;
        await video.play();
        if (cancelled) {
          stopActiveStream();
          return;
        }
        const scanControls = reader.scan(video, (result) => {
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
        }, () => {
          // QR bulunamadığında ZXing her kare için hata verebilir; bu normaldir.
        });
        controlsRef.current = {
          stop: () => {
            scanControls.stop();
            stopActiveStream();
          },
        };
        setScanning(true);
      } catch (reason: unknown) {
        stopActiveStream();
        if (!cancelled) {
          setScanning(false);
          setError(cameraErrorMessage(reason));
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      stopActiveStream();
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
        <div className="relative mt-4 aspect-square overflow-hidden rounded-xl border border-border bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay aria-label="QR kod kamera görüntüsü" />
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
