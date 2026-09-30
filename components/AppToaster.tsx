"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

type Theme = "dark" | "light";

export default function AppToaster() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const sync = () => setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <Toaster position="top-center" theme={theme} richColors closeButton expand visibleToasts={4} duration={4200} toastOptions={{ className: "text-[12px]" }} />;
}
