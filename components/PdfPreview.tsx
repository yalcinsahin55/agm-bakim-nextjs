"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/display/api";

interface PdfPreviewProps {
  src: string;
  filename: string;
}

export default function PdfPreview({ src, filename }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let pdfDocument: PDFDocumentProxy | null = null;
    const renderTasks: RenderTask[] = [];

    async function renderPdf() {
      const container = containerRef.current;
      if (!container) return;
      container.replaceChildren();
      setStatus("loading");
      setErrorMessage("");

      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        loadingTask = pdfjs.getDocument({ url: src, withCredentials: true });
        pdfDocument = await loadingTask.promise;

        const availableWidth = Math.max(container.clientWidth - 16, 320);
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdfDocument.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(1.5, Math.max(0.5, availableWidth / baseViewport.width));
          const viewport = page.getViewport({ scale });
          const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas oluşturulamadı.");

          canvas.width = Math.ceil(viewport.width * devicePixelRatio);
          canvas.height = Math.ceil(viewport.height * devicePixelRatio);
          canvas.style.width = `${Math.ceil(viewport.width)}px`;
          canvas.style.height = `${Math.ceil(viewport.height)}px`;
          canvas.className = "mx-auto mb-3 block max-w-full bg-white shadow-sm";
          container.appendChild(canvas);

          const renderTask = page.render({
            canvasContext: context,
            viewport,
            transform: devicePixelRatio === 1 ? undefined : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
          });
          renderTasks.push(renderTask);
          await renderTask.promise;
          page.cleanup?.();
        }

        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "PDF görüntülenemedi.");
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => task.cancel());
      if (pdfDocument) void pdfDocument.destroy();
      else if (loadingTask) void loadingTask.destroy();
    };
  }, [src]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-[#e5e7eb] p-2" aria-live="polite">
      {status === "loading" && <div className="flex min-h-[240px] items-center justify-center text-sm font-semibold text-muted">PDF hazırlanıyor…</div>}
      {status === "error" && (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-4 text-center text-sm text-red">
          <div>PDF mobil görüntüleyicide açılamadı.</div>
          <div className="max-w-md text-xs text-muted">{errorMessage || "Dosya verisi okunamadı."}</div>
          <a href={src} download={filename} className="rounded-lg border border-amber/40 px-3 py-2 text-xs font-bold text-amber">Dosyayı indir</a>
        </div>
      )}
      <div ref={containerRef} className={status === "ready" ? "block" : "hidden"} />
    </div>
  );
}
