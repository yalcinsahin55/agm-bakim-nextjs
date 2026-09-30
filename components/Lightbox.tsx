"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";

interface LightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export default function Lightbox({ src, alt = "", onClose }: LightboxProps) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const dismissedBySwipe = useRef(false);
  useEffect(() => {
    const closeOnEscape = () => onClose();
    window.addEventListener("app:escape", closeOnEscape);
    return () => window.removeEventListener("app:escape", closeOnEscape);
  }, [onClose]);
  if (!src) return null;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startY.current = event.clientY;
    dismissedBySwipe.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startY.current == null) return;
    setDragY(Math.max(0, event.clientY - startY.current));
  };
  const handlePointerUp = () => {
    if (dragY > 80) {
      dismissedBySwipe.current = true;
      onClose();
    }
    startY.current = null;
    setDragY(0);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in"
      onClick={() => { if (!dismissedBySwipe.current) onClose(); dismissedBySwipe.current = false; }}
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
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(event) => event.stopPropagation()}
        className="touch-pan-y transition-transform duration-150"
        style={{ transform: `translateY(${dragY}px)`, opacity: Math.max(0.45, 1 - dragY / 260) }}
      >
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1200}
          unoptimized
          sizes="(max-width: 768px) 92vw, 85vw"
          className="h-auto max-h-[85vh] w-auto max-w-full rounded-xl border border-border object-contain shadow-2xl"
        />
      </div>
      <div className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-faint">
        Kapatmak için dışarıya dokun
      </div>
    </div>
  );
}
