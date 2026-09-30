"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/components/ui/AppIcon";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 520);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Sayfanın başına git"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-28 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-panel/95 text-amber shadow-xl backdrop-blur-md transition-transform duration-150 hover:border-amber/50 active:scale-90 md:bottom-6 md:right-6"
    >
      <AppIcon name="arrowUp" size={19} />
    </button>
  );
}
