"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { engineSortKey } from "@/lib/status";
import { invalidateMaintenancePanel } from "@/lib/maintenancePanel";
import { WORK_DOMAIN_LABELS } from "@/lib/technicians";
import type { Engine, MaintenanceType, WorkDomain } from "@/lib/types";

interface EngineRowState {
  last: string;
  period: string;
  included: boolean;
}

const WORK_DOMAINS: WorkDomain[] = ["mechanical", "electrical", "commissioning"];

function refreshNotifications() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notifications:refresh"));
  }
}

export default function BakimTuruYonetimiPage() {
  const router = useRouter();
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [archivedTypes, setArchivedTypes] = useState<MaintenanceType[]>([]);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // ➕ Yeni tür formu
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPeriod, setNewPeriod] = useState(1000);
  const [newWorkDomains, setNewWorkDomains] = useState<WorkDomain[]>(["mechanical"]);
  const [newAllowElectromechanicalSupport, setNewAllowElectromechanicalSupport] = useState(false);
  const [newAllowElectromechanicalResponsible, setNewAllowElectromechanicalResponsible] = useState(false);
  const [addRows, setAddRows] = useState<Record<string, EngineRowState>>({});
  const [saving, setSaving] = useState(false);

  // ✏️ Düzenleme formu
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPeriod, setEditPeriod] = useState(0);
  const [editWorkDomains, setEditWorkDomains] = useState<WorkDomain[]>(["mechanical"]);
  const [editAllowElectromechanicalSupport, setEditAllowElectromechanicalSupport] = useState(false);
  const [editAllowElectromechanicalResponsible, setEditAllowElectromechanicalResponsible] = useState(false);
  const [editRows, setEditRows] = useState<Record<string, EngineRowState>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  async function load() {
    const [res, allTypesRes] = await Promise.all([
      fetch("/api/maintenance-types/panel"),
      fetch("/api/maintenance-types?include_deleted=true"),
    ]);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const data = await res.json();
    const allTypes = allTypesRes.ok ? await allTypesRes.json() : [];
    setTypes(Array.isArray(data.types) ? data.types : []);
    setArchivedTypes(Array.isArray(allTypes) ? allTypes.filter((type: MaintenanceType) => type.is_deleted === true) : []);
    setEngines(Array.isArray(data.engines) ? data.engines : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const sortedTypes = useMemo(() => [...types].sort((a, b) => (a.label || "").localeCompare(b.label || "", "tr")), [types]);
  const sortedArchivedTypes = useMemo(() => [...archivedTypes].sort((a, b) => (a.label || "").localeCompare(b.label || "", "tr")), [archivedTypes]);
  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  function setAddRow(id: string, field: "last" | "period", value: string) {
    setAddRows((prev) => ({ ...prev, [id]: { last: prev[id]?.last ?? "", period: prev[id]?.period ?? "", included: prev[id]?.included ?? true, [field]: value } }));
  }

  function setEditRow(id: string, field: "last" | "period", value: string) {
    setEditRows((prev) => ({ ...prev, [id]: { last: prev[id]?.last ?? "", period: prev[id]?.period ?? "", included: prev[id]?.included ?? false, [field]: value } }));
  }

  function toggleDomain(domains: WorkDomain[], setter: (next: WorkDomain[]) => void, domain: WorkDomain) {
    const next = domains.includes(domain) ? domains.filter((item) => item !== domain) : [...domains, domain];
    if (next.length === 0) { toast.error("En az bir çalışma alanı seçilmelidir."); return; }
    setter(next);
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
        if (!row?.included) return;
        engine_states[e._id] = {
          last_maintenance_hour: row.last !== "" ? Number(row.last) || 0 : (e.hours ?? 0),
          period_hours: row.period !== "" ? Number(row.period) || 0 : defPeriod,
        };
      });
      const res = await fetch("/api/maintenance-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), default_period_hours: defPeriod, engine_states, work_domains: newWorkDomains, allow_electromechanical_support: newAllowElectromechanicalSupport, allow_electromechanical_responsible: newAllowElectromechanicalResponsible }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`'${newLabel}' bakım türü eklendi! 🔧`);
        setNewLabel(""); setNewPeriod(1000); setNewWorkDomains(["mechanical"]); setNewAllowElectromechanicalSupport(false); setNewAllowElectromechanicalResponsible(false); setAddRows({}); setShowAdd(false);
        invalidateMaintenancePanel();
        refreshNotifications();
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
    setEditWorkDomains(Array.isArray(t.work_domains) && t.work_domains.length ? t.work_domains : ["mechanical"]);
    setEditAllowElectromechanicalSupport(t.allow_electromechanical_support === true);
    setEditAllowElectromechanicalResponsible(t.allow_electromechanical_responsible === true);
    const r: Record<string, EngineRowState> = {};
    sortedEngines.forEach((e) => {
      const st = (t.engine_states || {})[e._id];
      r[e._id] = {
        last: st ? String(st.last_maintenance_hour ?? "") : "",
        period: st ? String(st.period_hours ?? "") : "",
        included: t.engine_scope === "all" || Boolean(st),
      };
    });
    setEditRows(r);
  }

  async function saveEdit(key: string) {
    setSavingEdit(true);
    const loadingToast = toast.loading("Kaydediliyor...");
    try {
      const engine_states: Record<string, { period_hours?: number; last_maintenance_hour?: number }> = {};
      const editingType = types.find((type) => type.key === key);
      sortedEngines.forEach((e) => {
        const row = editRows[e._id];
        if (!row?.included) return;
        const st: { period_hours?: number; last_maintenance_hour?: number } = {};
        if (row.period !== "") st.period_hours = Number(row.period) || 0;
        if (row.last !== "") st.last_maintenance_hour = Number(row.last) || 0;
        const wasIncluded = editingType?.engine_scope === "all" || Boolean(editingType?.engine_states?.[e._id]);
        if (Object.keys(st).length === 0 && !wasIncluded) {
          st.last_maintenance_hour = e.hours ?? 0;
          st.period_hours = Number(editPeriod) || 0;
        }
        if (Object.keys(st).length) engine_states[e._id] = st;
      });
      const remove_engine_ids = sortedEngines.filter((engine) => !editRows[engine._id]?.included).map((engine) => engine._id);
      const res = await fetch(`/api/maintenance-types/${key}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim(), default_period_hours: Number(editPeriod) || 0, engine_states, remove_engine_ids, work_domains: editWorkDomains, allow_electromechanical_support: editAllowElectromechanicalSupport, allow_electromechanical_responsible: editAllowElectromechanicalResponsible }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Bakım türü güncellendi! ✅");
        setEditingKey(null);
        invalidateMaintenancePanel();
        refreshNotifications();
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

  async function restoreType(key: string) {
    setRestoringKey(key);
    const loadingToast = toast.loading("Bakım türü geri alınıyor...");
    try {
      const res = await fetch(`/api/maintenance-types/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Bakım türü yeniden aktifleştirildi.");
        invalidateMaintenancePanel();
        refreshNotifications();
        await load();
      } else {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.error(data.error || "Geri alınamadı.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setRestoringKey(null);
    }
  }

  async function doDelete(key: string) {
    const loadingToast = toast.loading("Siliniyor...");
    try {
      const res = await fetch(`/api/maintenance-types/${key}`, { method: "DELETE" });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Bakım türü gizlendi; geçmiş kayıtlar korundu.");
        setConfirmDeleteKey(null);
        invalidateMaintenancePanel();
        refreshNotifications();
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
              sortedEngines.forEach((e) => { r[e._id] = { last: String(e.hours ?? 0), period: "", included: true }; });
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
            <div className="rounded-xl border border-border bg-panel2 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Çalışma alanı</div>
              <div className="mt-2 flex flex-wrap gap-1.5">{WORK_DOMAINS.map((domain) => <button key={domain} type="button" onClick={() => toggleDomain(newWorkDomains, setNewWorkDomains, domain)} className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${newWorkDomains.includes(domain) ? "border-teal/40 bg-teal/10 text-teal" : "border-border text-faint"}`}>{newWorkDomains.includes(domain) ? "✓ " : ""}{WORK_DOMAIN_LABELS[domain]}</button>)}</div>
              <div className="mt-2 flex flex-col gap-1.5 text-[11px] text-text"><label className="flex items-center gap-1.5"><input type="checkbox" checked={newAllowElectromechanicalSupport} onChange={(e) => setNewAllowElectromechanicalSupport(e.target.checked)} />Elektromekanik destek seçilebilir</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={newAllowElectromechanicalResponsible} onChange={(e) => setNewAllowElectromechanicalResponsible(e.target.checked)} />Elektromekanik sorumlu olabilir</label></div>
              <p className="mt-1.5 text-[10px] text-faint">Eski bakım türleri mekanik kabul edilir. Elektromekanik çalışanları ilgili alanda kullanmak için destek seçeneğini açın.</p>
            </div>
                              <div className="grid grid-cols-[48px_1fr_1fr_1fr] gap-1.5 text-[10px] text-faint font-bold uppercase mb-1 px-0.5">
              <span>Dahil</span><span>Motor</span><span>İlk Bakım Saati</span><span>Periyot</span>
            </div>

            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
              {sortedEngines.map((e) => (
                <div key={e._id} className="grid grid-cols-[48px_1fr_1fr_1fr] gap-1.5 items-center">
                  <label className="flex items-center justify-center" title={`${e.name} bakım kapsamına dahil olsun`}><input type="checkbox" checked={addRows[e._id]?.included ?? true} onChange={(event) => setAddRows((prev) => ({ ...prev, [e._id]: { last: prev[e._id]?.last ?? "", period: prev[e._id]?.period ?? "", included: event.target.checked } }))} /></label>
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
            <p className="text-[10.5px] text-faint">İşaretli motorlar kapsama alınır. İşareti kaldırılan motor için bakım kartı oluşturulmaz.</p>
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
                  <div className="mb-2 flex flex-wrap gap-1"><span className="rounded-full border border-border px-2 py-0.5 text-[9px] text-muted">{(t.work_domains || ["mechanical"]).map((domain) => WORK_DOMAIN_LABELS[domain]).join(" + ")}</span>{t.allow_electromechanical_support === true && <span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[9px] text-purple-200">Elektromekanik destek</span>}</div>
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
                      <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="text-[10px] font-bold uppercase tracking-wide text-muted">Çalışma alanı</div><div className="mt-2 flex flex-wrap gap-1.5">{WORK_DOMAINS.map((domain) => <button key={domain} type="button" onClick={() => toggleDomain(editWorkDomains, setEditWorkDomains, domain)} className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${editWorkDomains.includes(domain) ? "border-teal/40 bg-teal/10 text-teal" : "border-border text-faint"}`}>{editWorkDomains.includes(domain) ? "✓ " : ""}{WORK_DOMAIN_LABELS[domain]}</button>)}</div><div className="mt-2 flex flex-col gap-1.5 text-[11px] text-text"><label className="flex items-center gap-1.5"><input type="checkbox" checked={editAllowElectromechanicalSupport} onChange={(e) => setEditAllowElectromechanicalSupport(e.target.checked)} />Elektromekanik destek seçilebilir</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={editAllowElectromechanicalResponsible} onChange={(e) => setEditAllowElectromechanicalResponsible(e.target.checked)} />Elektromekanik sorumlu olabilir</label></div></div>
                      <div className="grid grid-cols-[48px_1fr_1fr_1fr] gap-1.5 text-[10px] text-faint font-bold uppercase mb-1 px-0.5">
                        <span>Dahil</span><span>Motor</span><span>Son Bakım Saati</span><span>Periyot</span>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                        {sortedEngines.map((e) => (
                          <div key={e._id} className="grid grid-cols-[48px_1fr_1fr_1fr] gap-1.5 items-center">
                            <label className="flex items-center justify-center" title={`${e.name} bakım kapsamına dahil olsun`}><input type="checkbox" checked={editRows[e._id]?.included ?? false} onChange={(event) => setEditRows((prev) => ({ ...prev, [e._id]: { last: prev[e._id]?.last ?? "", period: prev[e._id]?.period ?? "", included: event.target.checked } }))} /></label>
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
                      <p className="text-[10.5px] text-faint">İşareti kaldırılan motor kapsamdan çıkarılır. Boş bırakılan saat alanları mevcut değerini korur.</p>
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

        {sortedArchivedTypes.length > 0 && (
          <section className="mt-4 bg-panel border border-border rounded-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-bold text-text">Arşivlenmiş bakım türleri</h2>
              <span className="text-[10px] text-faint">{sortedArchivedTypes.length} gizli</span>
            </div>
            <p className="mt-1.5 text-[10.5px] text-faint">Silinen türler geçmiş kayıtlarıyla birlikte korunur. Geri aldığınızda aktif listelerde ve yeni bakım seçimlerinde yeniden görünür.</p>
            <div className="mt-3 flex flex-col gap-2">
              {sortedArchivedTypes.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-text">{t.label}</div>
                    <div className="text-[10px] text-faint">Varsayılan periyot: {t.default_period_hours ?? 0} sa</div>
                  </div>
                  <button
                    onClick={() => restoreType(t.key)}
                    disabled={restoringKey === t.key}
                    className="flex-shrink-0 rounded-lg border border-teal/40 px-2.5 py-1.5 text-[11px] font-bold text-teal hover:bg-teal/10 disabled:opacity-50"
                  >
                    {restoringKey === t.key ? "Alınıyor..." : "Geri al"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
