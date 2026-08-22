import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiFetchError, cachedFetch } from "@/lib/apiCache";

interface CurrentUser {
  id?: string;
  _id: string;
  full_name: string;
  email?: string;
  phone?: string;
  role: string;
  active?: boolean;
  approved?: boolean;
}

export function useCurrentUser() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    cachedFetch<CurrentUser>("/api/auth/me", 30_000)
      .then((data) => {
        if (alive) setUser(data);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        if (error instanceof ApiFetchError && error.status === 401) {
          router.push("/login");
          return;
        }
        setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [router]);

  return { user, loading };
}
