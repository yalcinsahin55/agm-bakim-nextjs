"use client";

import { useEffect, useRef } from "react";

/**
 * useEffect ile yüklenen veriler için AbortController yönetir.
 * Sayfa değiştiğinde devam eden fetch istekleri otomatik iptal edilir;
 * böylece memory sızıntısı ve yarım state güncellemeleri önlenir.
 *
 * Kullanım:
 *   const { signal } = useAbortableFetch();
 *   async function load() {
 *     const res = await fetch("/api/records", { signal });
 *     ...
 *   }
 *   useEffect(() => { if (!signal.aborted) load(); }, [signal]);
 */
export function useAbortableFetch(): { signal: AbortSignal } {
  const controllerRef = useRef<AbortController | null>(null);

  if (!controllerRef.current || controllerRef.current.signal.aborted) {
    controllerRef.current = new AbortController();
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { signal: controllerRef.current.signal };
}
