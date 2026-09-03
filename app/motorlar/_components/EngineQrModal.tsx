import Image from "next/image";
import { Button } from "@/components/ui";
import type { MotorEngine } from "../_lib/types";

interface EngineQrModalProps {
  engine: MotorEngine;
  qrDataUrl: string;
  onClose: () => void;
  onCopy: () => void;
}

export default function EngineQrModal({ engine, qrDataUrl, onClose, onCopy }: EngineQrModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 p-4 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${engine.name} QR kodu`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-panel border border-border rounded-2xl p-4 shadow-2xl text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-wider text-amber font-bold">Motor QR Kodu</div>
            <div className="text-base font-extrabold text-text mt-0.5">{engine.name}</div>
          </div>
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0"
            aria-label="QR penceresini kapat"
          >
            ✕
          </Button>
        </div>
        <div className="bg-white rounded-xl p-3 mx-auto w-fit min-h-[190px] min-w-[190px] flex items-center justify-center">
          {qrDataUrl ? <Image src={qrDataUrl} width={208} height={208} unoptimized alt={`${engine.name} motor QR kodu`} className="w-52 h-52" /> : <span className="text-xs text-slate-600">QR hazırlanıyor...</span>}
        </div>
        <p className="text-[11px] text-muted leading-relaxed mt-3">
          Bu kod okutulduğunda uygulama doğrudan bu motorun bakım panelini açar.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button
            type="button"
            onClick={onCopy}
            variant="secondary"
            size="md"
          >
            Bağlantıyı kopyala
          </Button>
          <a
            href={qrDataUrl || undefined}
            download={`${engine.name.replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "-")}-qr.png`}
            className={`py-2.5 rounded-lg bg-amber text-[#161006] text-[11px] font-extrabold transition ${qrDataUrl ? "hover:brightness-110" : "pointer-events-none opacity-50"}`}
          >
            PNG indir
          </a>
        </div>
        <Button
          type="button"
          onClick={onClose}
          variant="secondary"
          size="md"
          className="mt-2 w-full"
        >
          Kapat
        </Button>
      </div>
    </div>
  );
}
