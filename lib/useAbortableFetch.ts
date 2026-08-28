"use client";

import { useEffect, useState } from "react";

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
 *
 * Not: Signal ilk render'da aborted=false olan bir controller'dan gelir.
 * Cleanup (unmount) sırasında abort edilir.
 */
export function useAbortableFetch(): { signal: AbortSignal } {
  const [controller] = useState(() => new AbortController());

  useEffect(() => {
    return () => {
      controller.abort();
    };
  }, [controller]);

  return { signal: controller.signal };
}
