"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { formatDate, formatMinutes, stringValue } from "./AssistantResultPrimitives";

type Props = {
  data: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
  expandedRecordId: string | null;
  setExpandedRecordId: Dispatch<SetStateAction<string | null>>;
};

export default function AssistantRecordResults({ data, records, expandedRecordId, setExpandedRecordId }: Props) {
  if (records.length > 0) {
    const recordTotal = Number(data.total_records || records.length);
    const recordLimit = data.show_all === true ? 500 : 8;
    return <div className="mt-3 grid gap-2">{recordTotal > records.length && data.show_all !== true && <div className="rounded-lg border border-amber/25 bg-amber/5 px-2.5 py-2 text-[10px] text-muted">Toplam {recordTotal} bakım kaydı bulundu; en güncel {records.length} kayıt gösteriliyor. Sorunun sonuna “tümünü göster” ekleyerek güvenli üst sınır içindeki tüm kayıtları açabilirsin.</div>}{records.slice(0, recordLimit).map((record) => {
      const recordId = String(record.id);
      const expanded = expandedRecordId === recordId;
      const collaborators = Array.isArray(record.other_technicians) ? record.other_technicians.map((item) => String(item)).filter(Boolean).join(", ") : "";
      const attachments = Array.isArray(record.report_attachments) ? record.report_attachments.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
      return <div key={recordId} className="rounded-lg border border-border bg-panel2 p-2.5"><button type="button" onClick={() => setExpandedRecordId(expanded ? null : recordId)} aria-expanded={expanded} className="w-full text-left"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-bold text-text">{stringValue(record.type)}</div><div className="mt-0.5 truncate text-[10px] text-muted">{stringValue(record.technician)}</div></div><div className="flex-shrink-0 text-right text-[9.5px] text-faint">{formatDate(record.created_at)}<br />{formatMinutes(record.duration_minutes)} · {expanded ? "kapat ↑" : "detay →"}</div></div><div className="mt-2 text-[9.5px] text-faint">Motor: {stringValue(record.engine_name, stringValue(data.engine))} · Motor saati: {Number(record.hour_at_completion || 0).toLocaleString("tr-TR")}{Number(record.report_attachment_count || 0) > 0 ? ` · ${Number(record.report_attachment_count)} rapor eki` : ""}</div></button>{expanded && <div className="mt-2 grid gap-1 border-t border-border pt-2 text-[9.5px] text-muted"><div><span className="text-faint">Başlangıç:</span> {formatDate(record.start_at)} · <span className="text-faint">Bitiş:</span> {formatDate(record.end_at)}</div><div><span className="text-faint">Teknisyen kaynağı:</span> {stringValue(record.technician_source, "internal")}{record.external_service_name ? ` · ${stringValue(record.external_service_name)}` : ""}</div>{collaborators && <div><span className="text-faint">Diğer çalışanlar:</span> {collaborators}</div>}{attachments.length > 0 && <div className="mt-1 border-t border-border/70 pt-1"><span className="text-faint">Rapor ekleri:</span><div className="mt-1 grid gap-1">{attachments.map((attachment, index) => { const href = typeof attachment.href === "string" && attachment.href.startsWith("/api/records/") ? attachment.href : null; const downloadHref = typeof attachment.download_href === "string" && attachment.download_href.startsWith("/api/records/") ? attachment.download_href : null; const filename = stringValue(attachment.filename, `Rapor eki ${index + 1}`); return <div key={`${filename}-${index}`} className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-words text-muted">{filename}</span>{href && <Link href={href} target="_blank" rel="noreferrer" className="font-bold text-amber hover:underline">Aç</Link>}{downloadHref && <Link href={downloadHref} className="font-bold text-teal hover:underline">İndir</Link>}</div>; })}</div></div>}</div>}</div>;
    })}</div>;
  }

  return null;
}
