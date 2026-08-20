"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useCurrentUser() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/auth/me", { signal: controller.signal });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) throw new Error("Oturum alınamadı");
        const data = await res.json();
        if (!controller.signal.aborted) setUser(data);
      } catch (err) {
        // Component kapandıysa sessizce çık
        if (err.name === "AbortError") return;
        // Ağ hatası: çökme yerine boş kullanıcı bırak
        if (!controller.signal.aborted) setUser(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();

    // Component kapanırsa isteği iptal et (memory leak önleme)
    return () => controller.abort();
  }, [router]);

  return { user, loading };
}
