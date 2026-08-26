"use client";

import Image from "next/image";

interface LightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export default function Lightbox({ src, alt = "", onClose }: LightboxProps) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-panel text-text text-lg hover:bg-red hover:text-white transition"
        aria-label="Kapat"
      >
        ✕
      </button>
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={1200}
        unoptimized
        sizes="(max-width: 768px) 92vw, 85vw"
        onClick={(e) => e.stopPropagation()}
        className="h-auto max-h-[85vh] w-auto max-w-full rounded-xl border border-border object-contain shadow-2xl"
      />
      <div className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-faint">
        Kapatmak için dışarıya dokun
      </div>
    </div>
  );
}
