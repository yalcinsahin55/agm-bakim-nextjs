import PDFDocument from "pdfkit";
import { getPdfFontPaths } from "@/lib/pdfFonts";
import { loadDefaultExportLogo } from "@/lib/exportBranding";
import { fetchExportLogo } from "@/lib/assistantExportLogo";
import { arraySheets, formatValue, reportTitle, safeFilenamePart, scalarRows } from "@/lib/assistantExportRows";
import type { AssistantToolResponse } from "@/lib/assistantTools";
import type { AssistantExportOptions } from "@/lib/assistantExport";

const MAX_PDF_LINE_LENGTH = 1_200;

export function pdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}


export async function createPdf(result: AssistantToolResponse, question: string, options: AssistantExportOptions): Promise<Response> {
  const { regular: fontRegular, bold: fontBold } = getPdfFontPaths();
  const customLogo = options.includeLogo ? await fetchExportLogo(options.logoUrl) : null;
  const logo = customLogo || (options.includeLogo ? loadDefaultExportLogo() : null);
  const margin = options.margin === "narrow" ? 28 : 42;
  const doc = new PDFDocument({ size: options.pageSize, layout: options.orientation, margins: { top: margin, bottom: margin, left: margin, right: margin }, font: fontRegular, autoFirstPage: true });
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const heading = () => {
    const titleOffset = options.includeLogo ? 116 : 0;
    if (options.includeLogo) {
      let renderedCustomLogo = false;
      if (logo) {
        try {
          doc.image(logo.buffer, doc.page.margins.left, 34, { fit: [104, 24], valign: "center" });
          renderedCustomLogo = true;
        } catch {
          renderedCustomLogo = false;
        }
      }
      if (!renderedCustomLogo) {
        doc.save().circle(doc.page.margins.left + 12, 46, 12).fillColor("#e8952f").fill();
        doc.font(fontBold).fontSize(6.5).fillColor("#111827").text("AGM", doc.page.margins.left + 2, 42, { width: 20, align: "center" });
        doc.restore();
      }
    }
    doc.font(fontBold).fontSize(15).fillColor("#111827").text("Avcıkoru Santrali Motor Bakım Merkezi", doc.page.margins.left + titleOffset, 30, { width: width - titleOffset });
    doc.font(fontRegular).fontSize(10).fillColor("#4b5563").text(reportTitle(result), doc.page.margins.left + titleOffset, 52, { width: width - titleOffset });
    doc.font(fontRegular).fontSize(8).fillColor("#6b7280").text(`Rapor tarihi: ${new Date().toLocaleString("tr-TR")}`, doc.page.margins.left + titleOffset, 68, { width: width - titleOffset });
    doc.moveTo(doc.page.margins.left, 84).lineTo(doc.page.margins.left + width, 84).strokeColor("#9ca3af").lineWidth(0.7).stroke();
    doc.y = 98;
  };
  const writeFooter = () => {
    if (!options.includeFooter) return;
    doc.font(fontRegular).fontSize(7.5).fillColor("#6b7280").text("Salt okunur AGM Bakım raporu · Soru kapsamıyla sınırlıdır.", doc.page.margins.left, doc.page.height - doc.page.margins.bottom + 10, { width });
  };
  const ensureSpace = (height: number) => {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom - 18) {
      writeFooter();
      doc.addPage();
      heading();
    }
  };
  const writeLine = (text: string, bold = false) => {
    const safeText = text.slice(0, MAX_PDF_LINE_LENGTH);
    const lineHeight = doc.heightOfString(safeText, { width, lineGap: 1 }) + 5;
    ensureSpace(lineHeight);
    doc.font(bold ? fontBold : fontRegular).fontSize(bold ? 10.5 : 9).fillColor(bold ? "#111827" : "#374151").text(safeText, { width, lineGap: 1 });
    doc.y += 2;
  };

  heading();
  writeLine("Soru", true);
  writeLine(question);
  writeLine("Cevap", true);
  writeLine(result.summary);

  scalarRows(result).forEach((row) => writeLine(`${row.Alan}: ${row.Değer}`));
  arraySheets(result, options).forEach((sheet) => {
    writeLine(sheet.name, true);
    sheet.rows.forEach((row, index) => {
      const content = Object.entries(row).map(([key, value]) => `${key}: ${formatValue(value)}`).join(" · ");
      writeLine(`${index + 1}. ${content}`);
    });
  });
  if (scalarRows(result).length === 0 && arraySheets(result, options).length === 0) writeLine("Sonuç ayrıntısı bulunamadı.");
  writeFooter();

  const buffer = await pdfBuffer(doc);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": `attachment; filename="AGM_Bakim_Asistani_${safeFilenamePart(result.intent)}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

