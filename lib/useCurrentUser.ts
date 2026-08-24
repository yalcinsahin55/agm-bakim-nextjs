import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiFetchError, cachedFetch } from "@/lib/apiCache";
import type { TechnicianType, WorkDomain } from "@/lib/types";

interface CurrentUser {
  id: string;
  _id?: string;
  full_name: string;
  email?: string;
  phone?: string;
  role: string;
  technician_type?: TechnicianType;
  can_be_responsible?: boolean;
  can_be_support?: boolean;
  allowed_work_domains?: WorkDomain[];
  active?: boolean;
  approved?: boolean;
}

export function useCurrentUser() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    cachedFetch<CurrentUser>("/api/auth/me", 30_000)
      .then((data) => {
        if (!alive) return;
        setUser(data);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!alive) return;
        if (requestError instanceof ApiFetchError && requestError.status === 401) {
          setUser(null);
          router.replace("/login");
          return;
        }
        setUser(null);
        setError("Oturum doğrulanamadı. Lütfen tekrar giriş yapın.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [router]);

  return { user, loading, error };
}
