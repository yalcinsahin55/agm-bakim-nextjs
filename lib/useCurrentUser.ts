import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiFetchError, cachedFetch } from "@/lib/apiCache";
import type { TechnicianType, WorkDomain } from "@/lib/types";
import { AUTH_CHANGED_EVENT } from "@/lib/authClient";

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
    let latestRequest = 0;
    const refreshCurrentUser = () => {
      const requestId = ++latestRequest;
      setLoading(true);
      setError(null);
      void cachedFetch<CurrentUser>("/api/auth/me", 30_000)
        .then((data) => {
          if (!alive || requestId !== latestRequest) return;
          setUser(data);
          setError(null);
        })
        .catch((requestError: unknown) => {
          if (!alive || requestId !== latestRequest) return;
          if (requestError instanceof ApiFetchError && requestError.status === 401) {
            setUser(null);
            router.replace("/login");
            return;
          }
          setUser(null);
          setError("Oturum doğrulanamadı. Lütfen tekrar giriş yapın.");
        })
        .finally(() => {
          if (alive && requestId === latestRequest) setLoading(false);
        });
    };

    refreshCurrentUser();
    window.addEventListener(AUTH_CHANGED_EVENT, refreshCurrentUser);
    return () => {
      alive = false;
      latestRequest += 1;
      window.removeEventListener(AUTH_CHANGED_EVENT, refreshCurrentUser);
    };
  }, [router]);

  return { user, loading, error };
}
