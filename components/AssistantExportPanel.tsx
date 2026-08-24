"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  EXPORT_COLUMN_LABELS,
  exportSheetLabel,
  getAvailableColumns,
  getAvailableSheetKeys,
  getDefaultExportOptions,
  getExportColumnValue,
  getPresetOptions,
  type AssistantExportOptions,
  type AssistantExportPreset,
  type ExportColumnId,
} from "@/lib/assistantExport";

const PRESET_LABELS: Record<AssistantExportPreset, string> = {
  summary: "Yönetici özeti",
  detail: "Detaylı rapor",
  audit: "Denetim raporu",
  raw: "Ham veri görünümü",
};

const SORT_OPTIONS: Array<[AssistantExportOptions["sort"], string]> = [
  ["date_desc", "Tarih: yeniden eskiye"],
  ["date_asc", "Tarih: eskiden yeniye"],
  ["engine", "Motora göre"],
  ["type", "Bakım türüne göre"],
  ["technician", "Teknisyene göre"],
];

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleString("tr-TR");
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("tr-TR") : "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (Array.isArray(value)) return value.map((item) => formatPreviewValue(item)).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(formatPreviewValue).join(" · ");
  return String(value);
}

function typeOptionsFromData(data: Record<string, unknown>): string[] {
  const values: unknown[] = [];
  for (const key of ["items", "by_type", "activities"]) {
    if (Array.isArray(data[key])) values.push(...data[key]);
  }
  if (Array.isArray(data.daily_records)) {
    for (const item of data.daily_records) {
      if (item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).types)) values.push(...((item as Record<string, unknown>).types as unknown[]));
    }
  }
  const labels = values.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const type = record.type ?? record.type_label;
    return typeof type === "string" && type.trim() ? [type.trim()] : [];
  });
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b, "tr"));
}

function exportFileName(kind: "pdf" | "excel", intent: string): string {
  return kind === "pdf" ? `AGM_Bakim_Asistani_${intent || "rapor"}.pdf` : `AGM_Bakim_Asistani_${intent || "rapor"}.xlsx`;
}

export default function AssistantExportPanel({ question, intent, data, exportQuery = {}, canManageLogo = false }: { question: string; intent: string; data: Record<string, unknown>; exportQuery?: Record<string, string>; canManageLogo?: boolean }) {
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "excel" | "">("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const defaults = useMemo(() => getDefaultExportOptions(intent, data), [data, intent]);
  const [options, setOptions] = useState<AssistantExportOptions>(() => ({
    ...defaults,
    excludedTypes: exportQuery.exclude_type_label
      ? exportQuery.exclude_type_label.split(",").map((value) => value.trim()).filter(Boolean)
      : Array.isArray(data.excluded_type_labels) ? data.excluded_type_labels.filter((value): value is string => typeof value === "string") : [],
  }));
  useEffect(() => {
    if (exportQuery.exclude_type_label === undefined) return;
    const excludedTypes = exportQuery.exclude_type_label.split(",").map((value) => value.trim()).filter(Boolean);
    setOptions((current) => ({ ...current, excludedTypes }));
  }, [exportQuery.exclude_type_label]);
  const availableColumns = useMemo(() => getAvailableColumns(intent), [intent]);
  const availableSheets = useMemo(() => getAvailableSheetKeys(intent, data), [data, intent]);
  const typeOptions = useMemo(() => typeOptionsFromData(data), [data]);
  const previewSheet = useMemo(() => {
    const key = options.sheets.find((sheet) => Array.isArray(data[sheet]));
    if (!key) return null;
    const values = Array.isArray(data[key]) ? data[key] : [];
    return { key, rows: values.slice(0, 5).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) };
  }, [data, options.sheets]);

  function updateOptions(next: Partial<AssistantExportOptions>) {
    setOptions((current) => ({ ...current, ...next }));
  }

  function applyPreset(preset: AssistantExportPreset) {
    const presetOptions = getPresetOptions(intent, data, preset);
    updateOptions({ preset, columns: presetOptions.columns.length ? presetOptions.columns : availableColumns, sheets: presetOptions.sheets.length ? presetOptions.sheets : availableSheets });
  }

  function toggleColumn(column: ExportColumnId) {
    setOptions((current) => {
      const has = current.columns.includes(column);
      if (has && current.columns.length === 1) return current;
      return { ...current, columns: has ? current.columns.filter((item) => item !== column) : [...current.columns, column] };
    });
  }

  function toggleSheet(sheet: string) {
    setOptions((current) => {
      const has = current.sheets.includes(sheet);
      if (has && current.sheets.length === 1) return current;
      return { ...current, sheets: has ? current.sheets.filter((item) => item !== sheet) : [...current.sheets, sheet] };
    });
  }

  function toggleExcludedType(type: string) {
    setOptions((current) => current.excludedTypes.includes(type)
      ? { ...current, excludedTypes: current.excludedTypes.filter((item) => item !== type) }
      : { ...current, excludedTypes: [...current.excludedTypes, type] });
  }

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!(file.type === "image/png" || file.type === "image/jpeg")) {
      setLogoError("Logo yalnızca PNG veya JPEG olabilir.");
      return;
    }
    if (file.size > 1_500_000) {
      setLogoError("Logo dosyası 1,5 MB’tan küçük olmalıdır.");
      return;
    }
    setUploadingLogo(true);
    setLogoError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/assistant/export-logo", { method: "POST", body: formData, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.url !== "string") throw new Error(payload.error || "Logo yüklenemedi.");
      updateOptions({ logoUrl: payload.url, includeLogo: true });
    } catch (uploadError) {
      setLogoError(uploadError instanceof Error ? uploadError.message : "Logo yüklenemedi.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function download(kind: "pdf" | "excel") {
    setBusy(kind);
    setError("");
    try {
      const params = new URLSearchParams(exportQuery);
      params.set("question", question);
      params.set("format", kind);
      params.set("preset", options.preset);
      params.set("columns", options.columns.join(","));
      params.set("sheets", options.sheets.join(","));
      params.set("orientation", options.orientation);
      params.set("page_size", options.pageSize);
      params.set("margin", options.margin);
      params.set("sort", options.sort);
      params.set("include_logo", options.includeLogo ? "1" : "0");
      params.set("include_footer", options.includeFooter ? "1" : "0");
      if (options.logoUrl) params.set("logo_url", options.logoUrl);
      else params.delete("logo_url");
      if (options.excludedTypes.length) params.set("exclude_type_label", options.excludedTypes.join(","));
      else params.delete("exclude_type_label");
      const response = await fetch(`/api/assistant/export?${params.toString()}`, { cache: "no-store" });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes(kind === "pdf" ? "application/pdf" : "spreadsheetml")) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(response.status === 401 ? "Oturum süresi doldu." : payload.error || "Dosya hazırlanamadı.");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Boş rapor dosyası oluşturuldu.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(kind, intent);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Dosya indirilemedi.");
    } finally {
      setBusy("");
    }
  }

  const scopeParts = [
    exportQuery.from && exportQuery.to ? `${exportQuery.from} – ${exportQuery.to}` : "Soru dönemi",
    exportQuery.engine_id ? "Seçili motor" : "Motor filtresi soru kapsamından",
    exportQuery.technician_id ? "Seçili teknisyen" : null,
  ].filter(Boolean);

  return <div className="mt-3 min-w-0 rounded-xl border border-amber/25 bg-amber/5 p-2.5">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="mr-auto text-[9px] font-bold uppercase tracking-wide text-amber">Bu cevabın raporu</span>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="rounded-lg border border-amber/35 bg-panel2 px-2.5 py-1.5 text-[10px] font-bold text-amber hover:border-amber/70">{open ? "Paneli kapat" : "Özelleştir"}</button>
      <button type="button" onClick={() => void download("pdf")} disabled={Boolean(busy)} className="rounded-lg border border-border bg-panel2 px-2.5 py-1.5 text-[10px] font-bold text-muted hover:border-amber/50 hover:text-amber disabled:opacity-50">{busy === "pdf" ? "Hazırlanıyor..." : "PDF indir"}</button>
      <button type="button" onClick={() => void download("excel")} disabled={Boolean(busy)} className="rounded-lg border border-border bg-panel2 px-2.5 py-1.5 text-[10px] font-bold text-muted hover:border-green/50 hover:text-green disabled:opacity-50">{busy === "excel" ? "Hazırlanıyor..." : "Excel indir"}</button>
    </div>
    {open && <div className="mt-2 grid min-w-0 gap-3 border-t border-amber/15 pt-2.5">
      <div className="rounded-lg border border-border bg-panel2 px-2.5 py-2">
        <div className="text-[9px] font-bold uppercase tracking-wide text-faint">Rapor kapsamı</div>
        <div className="mt-1 break-words text-[10px] leading-4 text-muted">Bu rapor yalnızca mevcut sorunun cevabındaki kayıtları kullanır. {scopeParts.join(" · ")}</div>
        <div className="mt-1 break-words text-[9px] text-faint">Soru: {question}</div>
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-faint">Hazır şablon</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(PRESET_LABELS) as AssistantExportPreset[]).map((preset) => <button type="button" key={preset} onClick={() => applyPreset(preset)} className={`min-h-[34px] rounded-lg border px-2 py-1.5 text-left text-[9.5px] font-bold ${options.preset === preset ? "border-amber/60 bg-amber/10 text-amber" : "border-border bg-panel2 text-muted hover:border-amber/40"}`}>{PRESET_LABELS[preset]}</button>)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-faint">PDF sayfa düzeni</div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex items-center gap-1.5 rounded-lg border border-border bg-panel2 px-2 py-1.5 text-[9.5px] text-muted"><span>Yön</span><select value={options.orientation} onChange={(event) => updateOptions({ orientation: event.target.value as AssistantExportOptions["orientation"] })} className="min-w-0 flex-1 bg-transparent text-[9.5px] text-text outline-none"><option value="portrait">Dikey</option><option value="landscape">Yatay</option></select></label>
            <label className="flex items-center gap-1.5 rounded-lg border border-border bg-panel2 px-2 py-1.5 text-[9.5px] text-muted"><span>Kağıt</span><select value={options.pageSize} onChange={(event) => updateOptions({ pageSize: event.target.value as AssistantExportOptions["pageSize"] })} className="min-w-0 flex-1 bg-transparent text-[9.5px] text-text outline-none"><option value="A4">A4</option><option value="A3">A3</option></select></label>
            <label className="flex items-center gap-1.5 rounded-lg border border-border bg-panel2 px-2 py-1.5 text-[9.5px] text-muted"><span>Kenar</span><select value={options.margin} onChange={(event) => updateOptions({ margin: event.target.value as AssistantExportOptions["margin"] })} className="min-w-0 flex-1 bg-transparent text-[9.5px] text-text outline-none"><option value="normal">Normal</option><option value="narrow">Dar</option></select></label>
            <label className="flex items-center gap-1.5 rounded-lg border border-border bg-panel2 px-2 py-1.5 text-[9.5px] text-muted"><span>Sırala</span><select value={options.sort} onChange={(event) => updateOptions({ sort: event.target.value as AssistantExportOptions["sort"] })} className="min-w-0 flex-1 bg-transparent text-[9.5px] text-text outline-none">{SORT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] text-muted"><label className="flex items-center gap-1.5"><input type="checkbox" checked={options.includeLogo} onChange={(event) => updateOptions({ includeLogo: event.target.checked })} />AGM marka işareti</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={options.includeFooter} onChange={(event) => updateOptions({ includeFooter: event.target.checked })} />Alt bilgi ve sayfa kapsamı</label></div>
          {canManageLogo && <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2"><input ref={logoInputRef} type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} className="sr-only" /><button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="rounded-lg border border-border bg-panel2 px-2.5 py-1.5 text-[9.5px] font-bold text-muted hover:border-amber/50 hover:text-amber disabled:opacity-50">{uploadingLogo ? "Logo yükleniyor..." : options.logoUrl ? "Logoyu değiştir" : "Özel logo yükle"}</button>{options.logoUrl && <span className="max-w-[190px] truncate text-[9px] text-teal">Özel logo rapora hazır</span>}{logoError && <span role="alert" className="text-[9px] text-red">{logoError}</span>}</div>}
          {!canManageLogo && <div className="mt-2 text-[9px] text-faint">Özel logo yükleme yalnız yöneticiler için açıktır. Varsayılan AGM işareti kullanılabilir.</div>}
        </div>
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase tracking-wide text-faint">Sütunlar</span><span className="text-[9px] text-faint">{options.columns.length} seçili</span></div>
          <div className="grid max-h-[180px] min-w-0 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border border-border bg-panel2 p-2">{availableColumns.map((column) => <label key={column} className="flex min-w-0 items-center gap-1.5 text-[9.5px] text-muted"><input type="checkbox" checked={options.columns.includes(column)} onChange={() => toggleColumn(column)} /><span className="truncate">{EXPORT_COLUMN_LABELS[column]}</span></label>)}</div>
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase tracking-wide text-faint">Excel sayfaları</span><span className="text-[9px] text-faint">{options.sheets.length} seçili</span></div>
          <div className="grid max-h-[180px] min-w-0 gap-y-1 overflow-y-auto rounded-lg border border-border bg-panel2 p-2">{availableSheets.length ? availableSheets.map((sheet) => <label key={sheet} className="flex min-w-0 items-center gap-1.5 text-[9.5px] text-muted"><input type="checkbox" checked={options.sheets.includes(sheet)} onChange={() => toggleSheet(sheet)} /><span className="truncate">{exportSheetLabel(sheet)}</span></label>) : <span className="text-[9.5px] text-faint">Bu cevap için ayrıntı sayfası bulunamadı.</span>}</div>
        </div>
      </div>
      {typeOptions.length > 0 && <div className="min-w-0"><div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-faint">Rapor dışında bırakılacak bakım türleri</div><div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1.5 rounded-lg border border-border bg-panel2 p-2">{typeOptions.map((type) => <label key={type} className="flex min-w-0 items-center gap-1.5 text-[9.5px] text-muted"><input type="checkbox" checked={options.excludedTypes.some((excluded) => excluded.localeCompare(type, "tr", { sensitivity: "base" }) === 0)} onChange={() => toggleExcludedType(type)} /><span className="max-w-[210px] truncate">{type}</span></label>)}</div><div className="mt-1 text-[9px] text-faint">Hariç tutulan türler PDF/Excel ve export özetindeki ilgili sonuçlardan çıkarılır.</div></div>}
      {previewSheet && <div className="min-w-0"><button type="button" onClick={() => setPreviewOpen((current) => !current)} aria-expanded={previewOpen} className="text-[9.5px] font-bold text-amber hover:underline">{previewOpen ? "Önizlemeyi kapat ↑" : "İlk 5 satırı önizle ↓"}</button>{previewOpen && <div className="mt-1.5 min-w-0 overflow-x-auto rounded-lg border border-border bg-panel2 p-2"><div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-faint">{exportSheetLabel(previewSheet.key)} · önizleme</div><div className="grid min-w-[420px] gap-1">{previewSheet.rows.map((row, index) => <div key={index} className="grid gap-1 border-b border-border/70 pb-1 last:border-0 sm:grid-cols-2">{options.columns.slice(0, 6).map((column) => <div key={column} className="min-w-0 text-[9px]"><span className="text-faint">{EXPORT_COLUMN_LABELS[column]}: </span><span className="break-words text-muted">{formatPreviewValue(getExportColumnValue(row, column))}</span></div>)}</div>)}</div></div>}</div>}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-amber/15 pt-2"><button type="button" onClick={() => void download("pdf")} disabled={Boolean(busy)} className="rounded-lg bg-amber px-3 py-2 text-[10px] font-bold text-bg disabled:opacity-50">{busy === "pdf" ? "PDF hazırlanıyor..." : "Özelleştirilmiş PDF oluştur"}</button><button type="button" onClick={() => void download("excel")} disabled={Boolean(busy)} className="rounded-lg border border-green/40 bg-green/10 px-3 py-2 text-[10px] font-bold text-green disabled:opacity-50">{busy === "excel" ? "Excel hazırlanıyor..." : "Özelleştirilmiş Excel oluştur"}</button></div>
    </div>}
    {error && <div role="alert" className="mt-2 text-[9px] text-red">{error}</div>}
  </div>;
}
