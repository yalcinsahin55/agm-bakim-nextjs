import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { withApiTiming } from "@/lib/performance";
import { formatMaintenanceDuration } from "@/lib/maintenanceTime";
import { buildMaintenanceRecordQuery } from "@/lib/reportFilterQuery";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5_000;
const COLUMN_WIDTHS = [40, 55, 75, 38, 52, 52, 45, 52, 52, 62];
const COLUMN_LABELS = ["Tarih", "Motor", "Bakım Türü", "Saat", "Başlangıç", "Bitiş", "Süre", "Sorumlu", "Ekip", "Not"];

function pdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

async function createPdf(req: NextRequest) {
  const db = await getDb();
  await ensureAppIndexes(db);
  const user = await getCurrentUser(req, db.collection("users") as any);
  if (!user) return new Response(JSON.stringify({ error: "Giriş gerekli" }), { status: 401 });

  const { searchParams } = new URL(req.url);
  const engineFilter = searchParams.get("engine_id");
  const query = buildMaintenanceRecordQuery(searchParams);

  const engines = await (db.collection("engines") as any).find({}, { projection: { _id: 1, name: 1 } }).toArray();
  const selectedEngine = engineFilter ? engines.find((engine: any) => engine._id === engineFilter || engine.name === engineFilter) : null;
  const recordsCollection = db.collection("maintenance_records") as any;
  const [total, records] = await Promise.all([
    recordsCollection.countDocuments(query),
    recordsCollection.find(query, { projection: { photos_b64: 0, photos: 0, videos: 0 } }).sort({ created_at: -1, _id: -1 }).limit(MAX_ROWS).toArray(),
  ]);

  const regularFont = path.join(process.cwd(), "public/fonts/agm-noto-sans.ttf");
  const boldFont = path.join(process.cwd(), "public/fonts/agm-noto-sans-bold.ttf");
  const hasFonts = fs.existsSync(regularFont) && fs.existsSync(boldFont);
  const doc = new PDFDocument({ size: "A4", margins: { top: 36, bottom: 36, left: 36, right: 36 }, autoFirstPage: true });
  const fontRegular = hasFonts ? regularFont : "Helvetica";
  const fontBold = hasFonts ? boldFont : "Helvetica-Bold";
  const title = selectedEngine ? `${selectedEngine.name} Bakım Geçmişi` : "Tüm Motorların Bakım Geçmişi";
  const left = doc.page.margins.left;
  const tableWidth = COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);

  function pageHeading() {
    doc.font(fontBold).fontSize(15).fillColor("#111827").text("Avcıkoru Santrali Bakım Merkezi", left, 30, { width: tableWidth });
    doc.font(fontRegular).fontSize(10).fillColor("#4b5563").text(title, left, 51, { width: tableWidth });
    doc.font(fontRegular).fontSize(8).fillColor("#6b7280").text(`Rapor tarihi: ${new Date().toLocaleDateString("tr-TR")} · Filtrelenen kayıt: ${total}${total > MAX_ROWS ? ` · İlk ${MAX_ROWS} kayıt gösteriliyor` : ""}`, left, 68, { width: tableWidth });
    doc.moveTo(left, 86).lineTo(left + tableWidth, 86).strokeColor("#9ca3af").lineWidth(0.7).stroke();
    doc.y = 98;
  }

  function tableHeading() {
    const top = doc.y;
    doc.rect(left, top, tableWidth, 22).fill("#e5e7eb");
    let x = left;
    COLUMN_LABELS.forEach((label, index) => {
      doc.font(fontBold).fontSize(7.7).fillColor("#1f2937").text(label, x + 4, top + 7, { width: COLUMN_WIDTHS[index] - 8, lineBreak: false });
      x += COLUMN_WIDTHS[index];
    });
    doc.y = top + 22;
  }

  function drawRow(values: string[], shaded: boolean) {
    const availableHeights = values.map((value, index) => doc.heightOfString(value || "—", { width: COLUMN_WIDTHS[index] - 8, lineGap: 1 }));
    const rowHeight = Math.max(24, Math.min(68, Math.max(...availableHeights) + 10));
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 12) {
      doc.addPage();
      pageHeading();
      tableHeading();
    }
    const top = doc.y;
    if (shaded) doc.rect(left, top, tableWidth, rowHeight).fill("#f9fafb");
    let x = left;
    values.forEach((value, index) => {
      doc.font(fontRegular).fontSize(7.6).fillColor("#111827").text(value || "—", x + 4, top + 5, { width: COLUMN_WIDTHS[index] - 8, height: rowHeight - 7, lineGap: 1, ellipsis: true });
      x += COLUMN_WIDTHS[index];
    });
    doc.moveTo(left, top + rowHeight).lineTo(left + tableWidth, top + rowHeight).strokeColor("#d1d5db").lineWidth(0.35).stroke();
    doc.y = top + rowHeight;
  }

  pageHeading();
  if (records.length === 0) {
    doc.font(fontRegular).fontSize(10).fillColor("#4b5563").text("Seçilen filtrelere uygun bakım kaydı bulunamadı.", left, doc.y + 12);
  } else {
    tableHeading();
    records.forEach((record: any, index: number) => {
      drawRow([
        record.created_at ? new Date(record.created_at).toLocaleDateString("tr-TR") : "",
        record.engine_name || "",
        record.type_label || "",
        record.hour_at_completion !== undefined && record.hour_at_completion !== null ? Number(record.hour_at_completion).toLocaleString("tr-TR") : "",
        record.maintenance_start_at ? new Date(record.maintenance_start_at).toLocaleString("tr-TR") : "",
        record.maintenance_end_at ? new Date(record.maintenance_end_at).toLocaleString("tr-TR") : "",
        formatMaintenanceDuration(record.maintenance_duration_minutes),
        record.technician_name || "",
        Array.isArray(record.other_technicians) ? record.other_technicians.map((technician: any) => technician.full_name).join(", ") : "",
        record.technician_note || "",
      ], index % 2 === 1);
    });
  }

  doc.font(fontRegular).fontSize(7.5).fillColor("#6b7280").text(`Oluşturan: ${user.full_name || "AGM Bakım Merkezi"}`, left, doc.page.height - 28, { width: tableWidth, align: "left" });
  const buffer = await pdfBuffer(doc);
  const filename = `AGM_Bakim_Gecmisi_${new Date().toISOString().slice(0, 10)}.pdf`;
  const pdfBody = new Blob([buffer as unknown as BlobPart], { type: "application/pdf" });
  return new Response(pdfBody, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/export/pdf", () => createPdf(req));
}
