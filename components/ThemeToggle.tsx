"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/components/ui/AppIcon";

const STORAGE_KEY = "agm-theme";
type Theme = "dark" | "light" | "system";

function applyTheme(theme: Theme) {
  const systemLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.toggle("light", theme === "light" || (theme === "system" && systemLight));
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme: Theme = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystem = () => { if (nextTheme === "system") applyTheme("system"); };
    media.addEventListener("change", syncSystem);
    return () => media.removeEventListener("change", syncSystem);
  }, []);

  function toggleTheme(): void {
    const nextTheme: Theme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  const label = theme === "dark" ? "Açık temaya geç" : theme === "light" ? "Sistem temasını kullan" : "Koyu temaya geç";
  return (
    <button type="button" onClick={toggleTheme} aria-label={label} title={`${theme === "system" ? "Sistem" : theme === "light" ? "Açık" : "Koyu"} tema · değiştirmek için tıkla`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-panel2 text-base transition hover:border-amber/50 hover:bg-panel">
      <AppIcon name={theme === "dark" ? "sun" : theme === "light" ? "moon" : "assistant"} size={17} />
    </button>
  );
}
