import fs from "node:fs";
import path from "node:path";

export type PdfFontPaths = {
  regular: string;
  bold: string;
};

/**
 * PDFKit'in built-in Helvetica fallback'i serverless bundle'larda .afm dosyası
 * arayabildiği için rapor üretiminde her zaman uygulamanın Unicode fontlarını kullanır.
 */
export function getPdfFontPaths(): PdfFontPaths {
  const regular = path.join(process.cwd(), "public/fonts/agm-noto-sans.ttf");
  const bold = path.join(process.cwd(), "public/fonts/agm-noto-sans-bold.ttf");
  if (!fs.existsSync(regular) || !fs.existsSync(bold)) {
    throw new Error("AGM PDF font files are not available");
  }
  return { regular, bold };
}
