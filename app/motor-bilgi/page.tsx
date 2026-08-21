// @ts-nocheck
"use client";
// JavaScript kaynak dosyasından TypeScript'e taşındı; dinamik API/form verileri çalışma zamanında doğrulanıyor.
// @ts-nocheck

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FIELDS = [
  ["kaver_tipi", "Kaver Tipi"], ["hava_filtresi", "Hava Filtresi"], ["krankcase", "Krankcase"],
  ["esanjor_tipi", "Eşanjör Tipi"], ["dungs", "Dungs"], ["radyator_tipi", "Radyatör Tipi"], ["not", "Not"],
];

function EmptyForm() {
  const f = {};
  FIELDS.forEach(([key]) => { f[key] = ""; });
  return f;
}

function FieldInputs({ values, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {FIELDS.map(([key, label]) => (
        <div key={key} className={key === "not" ? "col-span-2" : ""}>
          <label className="text-[9.5px] font-bold text-faint uppercase tracking-wide">{label}</label>
          <input
            value={values[key] || ""} onChange={(e) => onChange(key, e.target.value)}
            className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-[12.5px] mt-1 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
        </div>
      ))}
    </div>
  );
}

export default function MotorBilgiPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [items, setItems] = useState([]);
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newEngineName, setNewEngineName] = useState("");
  const [newFields, setNewFields] = useState(EmptyForm());
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState(EmptyForm());
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [infoRes, engRes] = await Promise.all([fetch("/api/equipment-info"), fetch("/api/engines")]);
      if (infoRes.status === 401) { router.push("/login"); return; }
      const infoData = await infoRes.json().catch(() => []);
      const engData = await engRes.json().catch(() => []);
      setItems(Array.isArray(infoData) ? infoData : []);
      setEngines(Array.isArray(engData) ? engData : []);
    } catch {
      toast.error("Veriler yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  const rows = useMemo(() => {
    const safe = Array.isArray(items) ? items : [];
    const q = (query || "").toLowerCase();
    const filtered = safe.filter((i) => (i.engine_name || "").toLowerCase().includes(q));
    return filtered.sort((a, b) => engineSortKey(a.engine_name || "") - engineSortKey(b.engine_name || ""));
  }, [items, query]);

  const engineNamesWithoutCard = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    const safeEngines = Array.isArray(engines) ? engines : [];
    const existing = new Set(safeItems.map((i) => i.engine_name || ""));
    return safeEngines.map((e) => e.name || "").filter((n) => n && !existing.has(n)).sort((a, b) => engineSortKey(a) - engineSortKey(b));
  }, [items, engines]);

  async function doImport() {
    if (!importFile) {
      toast.error("Lütfen bir Excel dosyası seçin.");
      return;
    }
    setImporting(true);
    const loadingToast = toast.loading("Excel işleniyor...");
    try {
      const file_b64 = await fileToBase64(importFile);
      const res = await fetch("/api/equipment-info/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_b64 }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`${data.updated} motor güncellendi! 📥`);
        setImportFile(null);
        setShowImport(false);
        load();
      } else {
        toast.dismiss(loadingToast);
        toast.error(data.error || "Dosya okunamadı.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setImporting(false);
    }
  }

  function startEdit(item) {
    setEditingId(item._id);
    const f = {};
    FIELDS.forEach(([key]) => { f[key] = item[key] || ""; });
    setEditFields(f);
  }

  async function saveEdit(id) {
    setSaving(true);
    const loadingToast = toast.loading("Kaydediliyor...");
    try {
      const res = await fetch(`/api/equipment-info/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editFields),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Motor bilgisi güncellendi! ✅");
        setEditingId(null);
        load();
      } else {
        const d = await res.json();
        toast.dismiss(loadingToast);
        toast.error(d.error || "Kaydedilemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  async function addNew() {
    if (!newEngineName.trim()) {
      toast.error("Lütfen bir motor seçin veya adı yazın.");
      return;
    }
    setAdding(true);
    const loadingToast = toast.loading("Ekleniyor...");
    try {
      const res = await fetch("/api/equipment-info", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine_name: newEngineName, ...newFields }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Motor bilgisi eklendi! 🛠️");
        setNewEngineName(""); setNewFields(EmptyForm()); setShowAdd(false);
        load();
      } else {
        const d = await res.json();
        toast.dismiss(loadingToast);
        toast.error(d.error || "Eklenemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Motor Bilgi Kartı" />
        <div className="px-4 py-4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
          <Skeleton className="h-12 w-full rounded-xl mb-3" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const canEdit = user && ["yonetici", "planlamaci"].includes(user.role);

  return (
    <div>
      <TopBar title="Motor Bilgi Kartı" subtitle={`${rows.length} motor listeleniyor`} />
      <div className="px-4 py-4">
        {canEdit && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => { setShowAdd((s) => !s); setShowImport(false); }} className={`py-2.5 rounded-xl font-bold text-[12px] transition-all ${showAdd ? "border border-border text-muted hover:bg-panel2" : "border border-amber/40 bg-amber/10 text-amber hover:bg-amber/20"}`}>
                {showAdd ? "✕ Kapat" : "➕ Yeni Motor"}
              </button>
              <button onClick={() => { setShowImport((s) => !s); setShowAdd(false); }} className={`py-2.5 rounded-xl font-bold text-[12px] transition-all ${showImport ? "border border-border text-muted hover:bg-panel2" : "border border-teal/40 bg-teal/10 text-teal hover:bg-teal/20"}`}>
                {showImport ? "✕ Kapat" : "📥 Excel'den"}
              </button>
            </div>

            {showAdd && (
              <div className="bg-panel border border-amber/40 rounded-card p-3.5 mb-4 animate-fade-in">
                <label className="text-[10.5px] font-bold text-muted uppercase tracking-wide block mb-1">Motor</label>
                {engineNamesWithoutCard.length > 0 ? (
                  <select value={newEngineName} onChange={(e) => setNewEngineName(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal transition">
                    <option value="">Seçiniz...</option>
                    {engineNamesWithoutCard.map((n) => <option key={n} value={n}>{n}</option>)}
                    <option value="__custom__">Listede yok, adını yazacağım...</option>
                  </select>
                ) : null}
                {(engineNamesWithoutCard.length === 0 || newEngineName === "__custom__") && (
                  <input
                    value={newEngineName === "__custom__" ? "" : newEngineName}
                    onChange={(e) => setNewEngineName(e.target.value)}
                    placeholder="Motor adı (örn. AGM 40)"
                    className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal transition"
                  />
                )}
                <FieldInputs values={newFields} onChange={(k, v) => setNewFields((prev) => ({ ...prev, [k]: v }))} />
                <button onClick={addNew} disabled={adding} className="w-full mt-3 py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13px] disabled:opacity-50 hover:brightness-110 transition">
                  {adding ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                      Ekleniyor...
                    </span>
                  ) : "💾 Motor Bilgisini Kaydet"}
                </button>
              </div>
            )}

            {showImport && (
              <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 animate-fade-in">
                <p className="text-[11.5px] text-muted mb-2 leading-relaxed">
                  <b className="text-teal">Motor No, Kaver Tipi, Hava Filtresi, Krankcase, Eşanjör Tipi, Dungs, Radyatör Tipi, Not</b> sütunlarını içeren bir dosya yükleyin.
                </p>
                <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-2 hover:border-amber hover:bg-amber/5 transition">
                  <span className="text-lg">📊</span>
                  <span className="flex-1 truncate">{importFile ? importFile.name : "Excel dosyası seç (.xlsx)"}</span>
                  <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
                <button onClick={doImport} disabled={importing || !importFile} className="w-full py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13px] disabled:opacity-50 hover:brightness-110 transition">
                  {importing ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                      İçe aktarılıyor...
                    </span>
                  ) : "🚀 İçe Aktar"}
                </button>
              </div>
            )}
          </>
        )}

        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">🔍</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Motor ara..." className="w-full bg-panel2 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🛠️</div>
            <p className="text-sm text-muted">{query ? "Arama sonucu bulunamadı." : "Henüz motor bilgisi eklenmemiş."}</p>
            {query && (
              <button onClick={() => setQuery("")} className="mt-3 px-4 py-2 bg-panel2 text-sm rounded-lg border border-border hover:bg-panel transition">
                Aramayı Temizle
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const isEditing = editingId === r._id;
              return (
                <div key={r._id} className={`bg-panel border rounded-card p-3.5 transition-all ${isEditing ? "border-teal/40" : "border-border hover:border-borderlt"}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[13.5px] font-bold text-text">{r.engine_name || "İsimsiz Motor"}</div>
                    {canEdit && !isEditing && (
                      <button onClick={() => startEdit(r)} className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1 hover:bg-teal/10 transition">✏️ Düzenle</button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="animate-fade-in">
                      <FieldInputs values={editFields} onChange={(k, v) => setEditFields((prev) => ({ ...prev, [k]: v }))} />
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-lg border border-border text-muted font-bold text-[12px] hover:bg-panel2 transition">Vazgeç</button>
                        <button onClick={() => saveEdit(r._id)} disabled={saving} className="flex-1 py-2 rounded-lg bg-teal text-[#06181b] font-bold text-[12px] disabled:opacity-50 hover:brightness-110 transition">
                          {saving ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-3 h-3 border-2 border-[#06181b]/40 border-t-[#06181b] rounded-full animate-spin" />
                              Kaydediliyor...
                            </span>
                          ) : "💾 Kaydet"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {FIELDS.map(([key, label]) => r[key] ? (
                        <div key={key} className="text-[11px]">
                          <span className="text-faint">{label}: </span>
                          <span className="text-muted">{r[key]}</span>
                        </div>
                      ) : null)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
