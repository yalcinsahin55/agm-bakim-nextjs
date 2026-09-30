"use client";

import { useEffect, useRef } from "react";

const SELECTOR = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export function useDialogA11y<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter((element) => !element.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  return ref;
}
