"use client";

/**
 * Client-side hata yakalama ve raporlama katmanı.
 *
 * Window error ve unhandled promise rejection olaylarını yakalar,
 * structured JSON olarak console'a yazar. Vercel bu logları otomatik
 * toplar. İleride SENTRY_DSN tanımlanırsa aynı noktadan Sentry'ye
 * de gönderim yapılabilir.
 *
 * Kullanım:
 *   app/layout.tsx içinde bir kez çağır:
 *   import { initErrorReporter } from "@/lib/errorReporter";
 *   initErrorReporter();
 */

type ErrorEventPayload = {
  type: "window_error" | "unhandled_rejection" | "manual_report";
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  timestamp: string;
  url: string;
};

function safeString(value: unknown, maxLen = 500): string {
  if (typeof value === "string") return value.slice(0, maxLen);
  if (value instanceof Error) return (value.message || value.name).slice(0, maxLen);
  try {
    return JSON.stringify(value).slice(0, maxLen);
  } catch {
    return String(value).slice(0, maxLen);
  }
}

function report(payload: ErrorEventPayload): void {
  if (process.env.NODE_ENV !== "production") {
    console.error("[client-error]", payload);
  } else {
    // Production'da Vercel bu logları otomatik toplar
    console.error(JSON.stringify({ ...payload, source: "client-error" }));
  }
}

export function initErrorReporter(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event: ErrorEvent) => {
    report({
      type: "window_error",
      message: safeString(event.message),
      filename: event.filename?.slice(0, 200),
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack?.slice(0, 1000) : undefined,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    report({
      type: "unhandled_rejection",
      message: safeString(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack?.slice(0, 1000) : undefined,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });
  });
}

/**
 * Manuel hata raporlama — catch bloklarından çağrılabilir.
 * İleride Sentry entegrasyonu buradan eklenecek.
 */
export function reportError(error: unknown, context?: string): void {
  report({
    type: "manual_report",
    message: safeString(error),
    stack: error instanceof Error ? error.stack?.slice(0, 1000) : undefined,
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : "",
    ...(context ? { filename: context.slice(0, 200) } : {}),
  });
}
