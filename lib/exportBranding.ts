import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ExportLogo = {
  buffer: Buffer;
  extension: "png" | "jpeg";
};

let cachedDefaultLogo: ExportLogo | null | undefined;

/**
 * Returns the app-wide default report logo. The PNG is preferred so PDF and
 * Excel exports preserve the transparent background; the old JPG remains a
 * compatibility fallback for local checkouts that have not received assets.
 */
export function loadDefaultExportLogo(): ExportLogo | null {
  if (cachedDefaultLogo !== undefined) return cachedDefaultLogo;

  const candidates: Array<{ filename: string; extension: ExportLogo["extension"] }> = [
    { filename: "yesil-global-logo.png", extension: "png" },
    { filename: "yesil-global-logo.jpg", extension: "jpeg" },
  ];

  for (const candidate of candidates) {
    const logoPath = path.join(process.cwd(), "public", candidate.filename);
    if (!existsSync(logoPath)) continue;
    try {
      const buffer = readFileSync(logoPath);
      if (buffer.byteLength > 0) {
        cachedDefaultLogo = { buffer, extension: candidate.extension };
        return cachedDefaultLogo;
      }
    } catch {
      // Try the next compatible asset if the preferred file is unavailable.
    }
  }

  cachedDefaultLogo = null;
  return cachedDefaultLogo;
}
