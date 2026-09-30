"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key === "Escape") {
        window.dispatchEvent(new Event("app:escape"));
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[aria-label='Bakım kaydı ara']")?.focus();
      } else if (event.key.toLowerCase() === "n" && pathname !== "/tamamla") {
        event.preventDefault();
        router.push("/tamamla");
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pathname, router]);

  return null;
}
