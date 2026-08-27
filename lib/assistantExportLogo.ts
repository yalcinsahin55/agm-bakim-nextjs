import { readResponseBytes } from "@/lib/pdfSecurity";

export async function fetchExportLogo(url: string | null): Promise<{ buffer: Buffer; extension: "png" | "jpeg" } | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !/(^|\.)public\.blob\.vercel-storage\.com$/i.test(parsed.hostname)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(parsed, { cache: "no-store", signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !/^image\/(?:png|jpeg)$/i.test(contentType)) return null;
    const bytes = await readResponseBytes(response, 1_500_000);
    if (!bytes || bytes.byteLength === 0) return null;
    const buffer = Buffer.from(bytes);
    return { buffer, extension: contentType.toLowerCase().includes("jpeg") ? "jpeg" : "png" };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

