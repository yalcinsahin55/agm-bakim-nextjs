"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";
import EquipmentInfoAddForm from "./_components/EquipmentInfoAddForm";
import EquipmentInfoCard from "./_components/EquipmentInfoCard";
import EquipmentInfoImportPanel from "./_components/EquipmentInfoImportPanel";
import { FIELDS, emptyForm } from "./_lib/types";
import type { EquipmentEngine, EquipmentInfo, EquipmentResponse, FieldValues } from "./_lib/types";
import { fileToBase64 } from "./_lib/fileToBase64";

export default function MotorBilgiPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [items, setItems] = useState<EquipmentInfo[]>([]);
  const [engines, setEngines] = useState<EquipmentEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newEngineName, setNewEngineName] = useState("");
  const [newFields, setNewFields] = useState(emptyForm());
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [infoRes, engRes] = await Promise.all([fetch("/api/equipment-info"), fetch("/api/engines")]);
      if (infoRes.status === 401) { router.push("/login"); return; }
      const infoData = await infoRes.json().catch(() => []) as unknown;
      const engData = await engRes.json().catch(() => []) as unknown;
      setItems(Array.isArray(infoData) ? infoData as EquipmentInfo[] : []);
      setEngines(Array.isArray(engData) ? engData as EquipmentEngine[] : []);
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
      const data = await res.json() as EquipmentResponse;
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

  function startEdit(item: EquipmentInfo) {
    setEditingId(item._id);
    const f = emptyForm();
    FIELDS.forEach(([key]) => { f[key] = item[key] || ""; });
    setEditFields(f);
  }

  async function saveEdit(id: string) {
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
        setNewEngineName(""); setNewFields(emptyForm()); setShowAdd(false);
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

  const canEdit = user?.role === "yonetici";

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
              <EquipmentInfoAddForm
                engineNamesWithoutCard={engineNamesWithoutCard}
                engineName={newEngineName}
                fields={newFields}
                adding={adding}
                onEngineNameChange={setNewEngineName}
                onFieldChange={(key, value) => setNewFields((prev) => ({ ...prev, [key]: value }))}
                onSave={addNew}
              />
            )}

            {showImport && (
              <EquipmentInfoImportPanel
                importFile={importFile}
                importing={importing}
                onFileChange={setImportFile}
                onImport={doImport}
              />
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
            {rows.map((item) => (
              <EquipmentInfoCard
                key={item._id}
                item={item}
                isEditing={editingId === item._id}
                canEdit={canEdit}
                editFields={editFields}
                saving={saving}
                onStartEdit={startEdit}
                onFieldChange={(key, value) => setEditFields((prev) => ({ ...prev, [key]: value }))}
                onCancelEdit={() => setEditingId(null)}
                onSave={() => saveEdit(item._id)}
              />
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
