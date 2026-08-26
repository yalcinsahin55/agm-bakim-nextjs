const IMAGE_PROCESSING_TIMEOUT_MS = 30_000;

export function compressImage(file: File, maxDim = 720, quality = 0.65): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let reader: FileReader | null = new FileReader();
    let image: HTMLImageElement | null = null;
    let canvas: HTMLCanvasElement | null = null;
    const timeoutId = window.setTimeout(() => {
      finishReject(new Error("Fotoğraf işleme zaman aşımına uğradı. Daha küçük bir fotoğraf deneyin."));
    }, IMAGE_PROCESSING_TIMEOUT_MS);

    const cleanup = (): void => {
      if (reader?.readyState === FileReader.LOADING) reader.abort();
      if (reader) {
        reader.onload = null;
        reader.onerror = null;
        reader.onabort = null;
      }
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      }
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      reader = null;
      image = null;
      canvas = null;
      window.clearTimeout(timeoutId);
    };

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const finishReject = (error: Error): void => {
      finish(() => reject(error));
    };

    reader.onload = (event: ProgressEvent<FileReader>): void => {
      const result = event.target?.result;
      if (typeof result !== "string") {
        finishReject(new Error("Fotoğraf okunamadı."));
        return;
      }

      image = new Image();
      image.onload = (): void => {
        try {
          let { width, height } = image as HTMLImageElement;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            finishReject(new Error("Fotoğraf işlenemedi."));
            return;
          }

          context.drawImage(image as HTMLImageElement, 0, 0, width, height);
          canvas.toBlob((blob): void => {
            if (!blob) {
              finishReject(new Error("Fotoğraf sıkıştırılamadı."));
              return;
            }
            finish(() => resolve(blob));
          }, "image/jpeg", quality);
        } catch {
          finishReject(new Error("Fotoğraf işlenemedi."));
        }
      };
      image.onerror = (): void => finishReject(new Error("Fotoğraf okunamadı."));
      image.src = result;
    };
    reader.onerror = (): void => finishReject(new Error("Fotoğraf okunamadı."));
    reader.onabort = (): void => finishReject(new Error("Fotoğraf işleme iptal edildi."));
    reader.readAsDataURL(file);
  });
}

export const imageCompressionConfig = {
  timeoutMs: IMAGE_PROCESSING_TIMEOUT_MS,
  maxDimension: 720,
  quality: 0.65,
} as const;
