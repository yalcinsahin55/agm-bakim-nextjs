"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";

export default function BakimTuruYonetimiPage() {
  const router = useRouter();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPeriod, setNewPeriod] = useState(1000);
  const [applyAll, setApplyAll] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingKey, setEditingKey] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPeriod, setEditPeriod] = useState(0);
  const [editApplyAll, setEditApplyAll] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);

  async function load() {
    const res = await fetch("/api/maintenance-types");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const data = await res.json();
    setTypes(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const sortedTypes = useMemo(() => [...types].sort((a, b) => (a.label || "").localeCompare(b.label || "", "tr")), [types]);

  async function addType() {
    setSaving(true);
    const loadingToast = toast.loading("Bakım türü ekleniyor...");
    try {
      const res = await fetch("/api/maintenance-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel, default_period_hours: Number(newPeriod), apply_to_all: applyAll }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`'${newLabel}' bakım türü eklendi! 🔧`);
        setNewLabel(""); setNewPeriod(1000); setShowAdd(false);
        load();
      } else {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.error(data.error || "Eklenemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t) {
    setEditingKey(t.key); setEditLabel(t.label); setEditPeriod(t.default_period_hours); setEditApplyAll(false);
  }

  async function saveEdit(key) {
    setSavingEdit(true);
    const loadingToast = toast.loading("Kaydediliyor...");
    try {
      const res = await fetch(`/api/maintenance-types/${key}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel, default_period_hours: Number(editPeriod), apply_period_to_all: editApplyAll }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Bakım türü güncellendi! ✅");
        setEditingKey(null);
        load();
      } else {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.error(data.error || "Güncellenemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete(key) {
    const loadingToast = toast.loading("Siliniyor...");
    try {
      const res = await fetch(`/api/maintenance-types/${key}`, { method: "DELETE" });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Bakım türü silindi! 🗑️");
        setConfirmDeleteKey(null);
        load();
      } else {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.error(data.error || "Silinemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Türü Yönetimi" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-3" />
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2">
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div>
        <TopBar title="Bakım Türü Yönetimi" />
        <div className="px-4 py-4">
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-sm text-muted">Bu sayfa yalnızca yöneticiler içindir.</p>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Türü Yönetimi" subtitle={`${sortedTypes.length} bakım türü`} />
      <div className="px-4 py-4">
        <button
          onClick={() => setShowAdd((s) => !s)}
          className={`w-full py-3 rounded-xl font-bold text-[13px] mb-3 transition-all ${
            showAdd ? "border border-border text-muted hover:bg-panel2" : "border border-teal/40 bg-teal/10 text-teal hover:bg-teal/20"
          }`}
        >
          {showAdd ? "✕ Kapat" : "➕ Yeni Bakım Türü Ekle"}
        </button>

        {showAdd && (
          <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 flex flex-col gap-2 animate-fade-in">
            <input placeholder="Bakım türü adı (örn. Egzoz Valfi Kontrolü)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
            <input type="number" placeholder="Periyodik bakım saati" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition" />
            <label className="flex items-center gap-2 text-[12px] text-muted cursor-pointer">
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
              Şimdi tüm motorlara uygula (motorların güncel saatini başlangıç kabul eder)
            </label>
            <button onClick={addType} disabled={saving || !newLabel.trim()} className="py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                  Ekleniyor...
                </span>
              ) : "🔧 Bakım Türünü Ekle"}
            </button>
          </div>
        )}

        {sortedTypes.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🔧</div>
            <p className="text-sm text-muted">Henüz bakım türü eklenmemiş.</p>
          </div>
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:items-start">
            {sortedTypes.map((t) => {
              const engineCount = Object.keys(t.engine_states || {}).length;
              return (
                <div key={t.key} className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-[13px] font-bold text-text truncate">{t.label}</div>
                    <span className="text-[9.5px] font-extrabold px-2 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber flex-shrink-0">
                      {engineCount} motor
                    </span>
                  </div>
                  <div className="text-[11px] text-faint mb-2">Varsayılan periyot: <span className="font-mono text-amber">{t.default_period_hours} sa</span></div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(t)} className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1.5 hover:bg-teal/10 transition">✏️ Düzenle</button>
                    {confirmDeleteKey === t.key ? (
                      <>
                        <button onClick={() => doDelete(t.key)} className="text-[11px] font-bold text-[#1a1206] bg-red rounded-lg px-2.5 py-1.5 hover:brightness-110 transition">⚠️ Emin misiniz?</button>
                        <button onClick={() => setConfirmDeleteKey(null)} className="text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-1.5 hover:bg-panel2 transition">Vazgeç</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDeleteKey(t.key)} className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-1.5 hover:bg-red/10 transition">🗑️ Sil</button>
                    )}
                  </div>

                  {editingKey === t.key && (
                    <div className="mt-2 pt-2 border-t border-border flex flex-col gap-2 animate-fade-in">
                      <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-teal transition" />
                      <input type="number" value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal transition" />
                      <label className="flex items-center gap-2 text-[11px] text-muted cursor-pointer">
                        <input type="checkbox" checked={editApplyAll} onChange={(e) => setEditApplyAll(e.target.checked)} />
                        Bu periyodu, bu türü zaten kullanan tüm motorlara da uygula
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingKey(null)} className="flex-1 py-2 rounded-lg border border-border text-muted font-bold text-[12px] hover:bg-panel2 transition">Vazgeç</button>
                        <button onClick={() => saveEdit(t.key)} disabled={savingEdit} className="flex-1 py-2 rounded-lg bg-teal text-[#06181b] font-bold text-[12px] disabled:opacity-50 hover:brightness-110 transition">
                          {savingEdit ? "..." : "💾 Kaydet"}
                        </button>
                      </div>
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
