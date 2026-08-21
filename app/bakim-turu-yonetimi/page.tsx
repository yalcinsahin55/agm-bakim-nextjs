"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { engineSortKey } from "@/lib/status";
import type { Engine, MaintenanceType } from "@/lib/types";

interface EngineRowState {
  last: string;
  period: string;
}

export default function BakimTuruYonetimiPage() {
  const router = useRouter();
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // ➕ Yeni tür formu
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPeriod, setNewPeriod] = useState(1000);
  const [addRows, setAddRows] = useState<Record<string, EngineRowState>>({});
  const [saving, setSaving] = useState(false);

  // ✏️ Düzenleme formu
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPeriod, setEditPeriod] = useState(0);
  const [editRows, setEditRows] = useState<Record<string, EngineRowState>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/maintenance-types/panel");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const data = await res.json();
    setTypes(Array.isArray(data.types) ? data.types : []);
    setEngines(Array.isArray(data.engines) ? data.engines : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const sortedTypes = useMemo(() => [...types].sort((a, b) => (a.label || "").localeCompare(b.label || "", "tr")), [types]);
  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  function setAddRow(id: string, field: keyof EngineRowState, value: string) {
    setAddRows((prev) => ({ ...prev, [id]: { last: "", period: "", ...prev[id], [field]: value } }));
  }

  function setEditRow(id: string, field: keyof EngineRowState, value: string) {
    setEditRows((prev) => ({ ...prev, [id]: { last: "", period: "", ...prev[id], [field]: value } }));
  }

  async function addType() {
    if (!newLabel.trim()) { toast.error("Bakım türü adı gerekli."); return; }
    setSaving(true);
    const loadingToast = toast.loading("Bakım türü ekleniyor...");
    try {
      const defPeriod = Number(newPeriod) || 0;
      const engine_states: Record<string, { last_maintenance_hour: number; period_hours: number }> = {};
      sortedEngines.forEach((e) => {
        const row = addRows[e._id];
        engine_states[e._id] = {
          last_maintenance_hour: row && row.last !== "" ? Number(row.last) || 0 : (e.hours ?? 0),
          period_hours: row && row.period !== "" ? Number(row.period) || 0 : defPeriod,
        };
      });
      const res = await fetch("/api/maintenance-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), default_period_hours: defPeriod, engine_states }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`'${newLabel}' bakım türü eklendi! 🔧`);
        setNewLabel(""); setNewPeriod(1000); setAddRows({}); setShowAdd(false);
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

  function startEdit(t: MaintenanceType) {
    setEditingKey(t.key);
    setEditLabel(t.label);
    setEditPeriod(t.default_period_hours ?? 0);
    const r: Record<string, EngineRowState> = {};
    sortedEngines.forEach((e) => {
      const st = (t.engine_states || {})[e._id];
      r[e._id] = {
        last: st ? String(st.last_maintenance_hour ?? "") : "",
        period: st ? String(st.period_hours ?? "") : "",
      };
    });
    setEditRows(r);
  }

  async function saveEdit(key: string) {
    setSavingEdit(true);
    const loadingToast = toast.loading("Kaydediliyor...");
    try {
      const engine_states: Record<string, { period_hours?: number; last_maintenance_hour?: number }> = {};
      sortedEngines.forEach((e) => {
        const row = editRows[e._id];
        if (!row) return;
        const st: { period_hours?: number; last_maintenance_hour?: number } = {};
        if (row.period !== "") st.period_hours = Number(row.period) || 0;
        if (row.last !== "") st.last_maintenance_hour = Number(row.last) || 0;
        if (Object.keys(st).length) engine_states[e._id] = st;
      });
      const res = await fetch(`/api/maintenance-types/${key}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim(), default_period_hours: Number(editPeriod) || 0, engine_states }),
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

  async function doDelete(key: string) {
    const loadingToast = toast.loading("Siliniyor...");
    try {
      const res = await fetch(`/api/maintenance-types/${key}`, { method: "DELETE" });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Bakım türü silindi! ️");
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
        <TopBar title="Bakım Türü Yönetimi" subtitle="" />
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
        <TopBar title="Bakım Türü Yönetimi" subtitle="" />
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
          onClick={() => {
            if (!showAdd) {
              const r: Record<string, EngineRowState> = {};
              sortedEngines.forEach((e) => { r[e._id] = { last: String(e.hours ?? 0), period: "" }; });
              setAddRows(r);
            }
            setShowAdd((s) => !s);
          }}
          className={`w-full py-3 rounded-xl font-bold text-[13px] mb-3 transition-all ${
            showAdd ? "border border-border text-muted hover:bg-panel2" : "border border-teal/40 bg-teal/10 text-teal hover:bg-teal/20"
          }`}
        >
          {showAdd ? "✕ Kapat" : "➕ Yeni Bakım Türü Ekle"}
        </button>

        {showAdd && (
          <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 flex flex-col gap-2 animate-fade-in">
            <input
              placeholder="Bakım türü adı (örn. Egzoz Valfi Kontrolü)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            />
            <input
              type="number"
              placeholder="Varsayılan periyodik bakım saati"
              value={newPeriod}
              onChange={(e) => setNewPeriod(Number(e.target.value))}
              className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition"
            />
            <div className="grid grid-cols-3 gap-1.5 text-[10px] text-faint font-bold uppercase mb-1 px-0.5">
              <span>Motor</span><span>İlk Bakım Saati</span><span>Periyot</span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
              {sortedEngines.map((e) => (
                <div key={e._id} className="grid grid-cols-3 gap-1.5 items-center">
                  <span className="text-[11.5px] font-semibold text-text">{e.name}</span>
                  <input
                    type="number"
                    placeholder={String(e.hours ?? 0)}
                    value={addRows[e._id]?.last ?? ""}
                    onChange={(ev) => setAddRow(e._id, "last", ev.target.value)}
                    className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                  />
                  <input
                    type="number"
                    placeholder={String(newPeriod || 0)}
                    value={addRows[e._id]?.period ?? ""}
                    onChange={(ev) => setAddRow(e._id, "period", ev.target.value)}
                    className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                  />
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-faint">Boş bırakılan satırlar: mevcut motor saati + varsayılan periyot kullanılır.</p>
            <button
              onClick={addType}
              disabled={saving || !newLabel.trim()}
              className="py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                  Ekleniyor...
                </span>
              ) : " Bakım Türünü Ekle"}
            </button>
          </div>
        )}

        {sortedTypes.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🧰</div>
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
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-teal transition"
                      />
                      <input
                        type="number"
                        value={editPeriod}
                        onChange={(e) => setEditPeriod(Number(e.target.value))}
                        className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal transition"
                      />
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] text-faint font-bold uppercase mb-1 px-0.5">
                        <span>Motor</span><span>Son Bakım Saati</span><span>Periyot</span>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                        {sortedEngines.map((e) => (
                          <div key={e._id} className="grid grid-cols-3 gap-1.5 items-center">
                            <span className="text-[11.5px] font-semibold text-text">{e.name}</span>
                            <input
                              type="number"
                              placeholder="—"
                              value={editRows[e._id]?.last ?? ""}
                              onChange={(ev) => setEditRow(e._id, "last", ev.target.value)}
                              className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                            />
                            <input
                              type="number"
                              placeholder="—"
                              value={editRows[e._id]?.period ?? ""}
                              onChange={(ev) => setEditRow(e._id, "period", ev.target.value)}
                              className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-[10.5px] text-faint">Yalnızca değiştirdiğin alanlar kaydedilir — boş bırakılanlar korunur.</p>
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
