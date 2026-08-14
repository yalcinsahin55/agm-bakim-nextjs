"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useCurrentUser() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then(async (res) => {
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setUser(data);
      setLoading(false);
    });
  }, [router]);

  return { user, loading };
}
