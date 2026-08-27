import type { Db } from "mongodb";
import type { AssistantQuery } from "@/lib/assistantPolicy";
import { oilAnalysesCollection, pressureReadingsCollection } from "@/lib/dbCollections";
import { formatUnknownDate } from "@/lib/assistantToolOutput";
import { dataDateMatch, findEngine } from "@/lib/assistantToolQuery";
import type { AssistantToolResponse } from "./types";
export async function getPressureReadings(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match: Record<string, unknown> = { ...dataDateMatch("reading_date", query) };
  if (selectedEngine) match.engine_id = String(selectedEngine._id);
  else if (query.engineQuery) match.engine_id = "__assistant_no_matching_engine__";
  const readings = await pressureReadingsCollection(db).find(match, { projection: { _id: 1, engine_id: 1, engine_name: 1, reading_date: 1, load_kw: 1, pressure_bar: 1, status: 1, new_type: 1, note: 1, created_at: 1 } }).sort({ reading_date: -1, created_at: -1 }).limit(100).toArray();
  return {
    intent: "pressure_readings",
    period: query.period,
    title: selectedEngine ? `${selectedEngine.name} karter basınç okumaları` : "Karter basınç okumaları",
    summary: `${readings.length} basınç ölçümü bulundu.`,
    data: { date_range: query.dateRange || null, readings: readings.map((reading) => ({ id: String(reading._id), engine_id: reading.engine_id, engine: reading.engine_name, reading_date: formatUnknownDate(reading.reading_date), load_kw: reading.load_kw === null || reading.load_kw === undefined ? null : Number(reading.load_kw), pressure_bar: reading.pressure_bar === null || reading.pressure_bar === undefined ? null : Number(reading.pressure_bar), status: reading.status || null, new_type: reading.new_type === true, note: reading.note || null })) },
  };
}

export async function getOilAnalysis(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match: Record<string, unknown> = { ...dataDateMatch("analysis_date", query) };
  if (selectedEngine) match.engine_id = String(selectedEngine._id);
  else if (query.engineQuery) match.engine_id = "__assistant_no_matching_engine__";
  const oilCollection = oilAnalysesCollection(db);
  const [analyses, base64PdfIds] = await Promise.all([
    oilCollection.find(match, { projection: { _id: 1, engine_id: 1, engine_name: 1, analysis_date: 1, result: 1, note: 1, pdf_url: 1, pdf_filename: 1, created_at: 1 } }).sort({ analysis_date: -1, created_at: -1 }).limit(100).toArray(),
    oilCollection.find({ ...match, pdf_b64: { $exists: true, $type: "string", $ne: "" } }, { projection: { _id: 1 } }).limit(1000).toArray(),
  ]);
  const base64PdfIdSet = new Set(base64PdfIds.map((item) => String(item._id)));
  return {
    intent: "oil_analysis",
    period: query.period,
    title: selectedEngine ? `${selectedEngine.name} yağ analizleri` : "Yağ analizleri",
    summary: `${analyses.length} yağ analizi bulundu. PDF dosyaları varsa sonuç satırından açılabilir.`,
    data: { date_range: query.dateRange || null, analyses: analyses.map((analysis) => { const hasPdf = Boolean(analysis.pdf_url) || base64PdfIdSet.has(String(analysis._id)); return { id: String(analysis._id), engine_id: analysis.engine_id, engine: analysis.engine_name, analysis_date: formatUnknownDate(analysis.analysis_date), result: analysis.result || null, note: analysis.note || null, pdf_filename: analysis.pdf_filename || null, has_pdf: hasPdf, pdf_href: hasPdf ? `/api/oil-analyses/${encodeURIComponent(String(analysis._id))}/file?inline=1` : null }; }) },
  };
}

