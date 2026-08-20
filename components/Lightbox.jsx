"use client";

export default function Lightbox({ src, alt = "", onClose }) {
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
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[85vh] rounded-xl border border-border object-contain shadow-2xl"
      />
      <div className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-faint">
        Kapatmak için dışarıya dokun
      </div>
    </div>
  );
}
