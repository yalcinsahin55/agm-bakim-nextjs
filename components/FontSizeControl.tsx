"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "agm-font-size";
const FONT_SIZES = [
  { value: "small", label: "Küçük", mark: "A−" },
  { value: "normal", label: "Normal", mark: "A" },
  { value: "large", label: "Büyük", mark: "A+" },
] as const;

type FontSize = (typeof FONT_SIZES)[number]["value"];

function isFontSize(value: string | null): value is FontSize {
  return value === "small" || value === "normal" || value === "large";
}

function applyFontSize(size: FontSize): void {
  document.documentElement.dataset.fontSize = size;
}

export default function FontSizeControl() {
  const [fontSize, setFontSize] = useState<FontSize>("normal");
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const nextSize = isFontSize(saved) ? saved : "normal";
    setFontSize(nextSize);
    applyFontSize(nextSize);

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function chooseFontSize(size: FontSize): void {
    setFontSize(size);
    applyFontSize(size);
    window.localStorage.setItem(STORAGE_KEY, size);
    setOpen(false);
  }

  const selectedLabel = FONT_SIZES.find((option) => option.value === fontSize)?.label ?? "Normal";

  return (
    <div ref={controlRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Yazı boyutu: ${selectedLabel}`}
        aria-expanded={open}
        aria-controls="font-size-options"
        title={`Yazı boyutu: ${selectedLabel}`}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-panel2 text-sm font-bold tracking-tight text-muted transition hover:border-amber/50 hover:bg-panel hover:text-text"
      >
        Aa
      </button>
      {open && (
        <div
          id="font-size-options"
          role="group"
          aria-label="Yazı boyutu"
          className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-border bg-panel p-3 shadow-xl"
        >
          <div className="mb-2 text-xs font-semibold text-text">Yazı boyutu</div>
          <div className="grid grid-cols-3 gap-1.5">
            {FONT_SIZES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseFontSize(option.value)}
                aria-label={`${option.label} yazı boyutu`}
                aria-pressed={fontSize === option.value}
                title={`${option.label} yazı boyutu`}
                className={`flex min-h-10 flex-col items-center justify-center rounded-lg border px-1.5 py-1 transition ${
                  fontSize === option.value
                    ? "border-amber/50 bg-amber/10 text-amber"
                    : "border-border bg-panel2 text-muted hover:border-amber/30 hover:text-text"
                }`}
              >
                <span className="text-sm font-bold">{option.mark}</span>
                <span className="text-[10px]">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
