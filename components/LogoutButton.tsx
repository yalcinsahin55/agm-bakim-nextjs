"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { invalidateCachedFetch } from "@/lib/apiCache";

export default function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Çıkış isteği başarısız oldu.");
      invalidateCachedFetch("/api/auth/me");
      toast.success("Güvenli çıkış yapıldı.");
      router.replace("/login");
    } catch {
      setLoggingOut(false);
      toast.error("Çıkış yapılamadı. Lütfen tekrar deneyin.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      aria-label="Çıkış Yap"
      title="Çıkış Yap"
      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[10.5px] font-bold text-muted transition hover:border-red/30 hover:bg-red/10 hover:text-red disabled:opacity-50"
    >
      <span aria-hidden="true">🚪</span>
      <span>{loggingOut ? "Çıkılıyor..." : "Çıkış"}</span>
    </button>
  );
}
