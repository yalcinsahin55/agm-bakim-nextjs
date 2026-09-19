"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "agm-theme";

type Theme = "dark" | "light";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme: Theme = saved === "light" || saved === "dark" ? saved : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("light", nextTheme === "light");
  }, []);

  function toggleTheme(): void {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("light", nextTheme === "light");
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Gündüz moduna geç" : "Gece moduna geç"}
      title={theme === "dark" ? "Gündüz modu" : "Gece modu"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-panel2 text-base transition hover:border-amber/50 hover:bg-panel"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
