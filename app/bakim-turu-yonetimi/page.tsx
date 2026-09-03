"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { engineSortKey } from "@/lib/status";
import { invalidateMaintenancePanel } from "@/lib/maintenancePanel";
import type { Engine, MaintenanceType, WorkDomain } from "@/lib/types";
import ArchivedMaintenanceTypes from "./_components/ArchivedMaintenanceTypes";
import MaintenanceTypeAddForm from "./_components/MaintenanceTypeAddForm";
import MaintenanceTypeCard from "./_components/MaintenanceTypeCard";
import type { EngineRowState } from "./_lib/types";
import { Button, EmptyState } from "@/components/ui";

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

  const load = useCallback(async () => {
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
  }, [router]);

  useEffect(() => { void load(); }, [load]);

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
          <EmptyState title="Bu sayfa yalnızca yöneticiler içindir." icon="🔒" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Türü Yönetimi" subtitle={`${sortedTypes.length} bakım türü`} />
      <div className="px-4 py-4">
        <Button
          type="button"
          onClick={() => {
            if (!showAdd) {
              const r: Record<string, EngineRowState> = {};
              sortedEngines.forEach((e) => { r[e._id] = { last: String(e.hours ?? 0), period: "", included: true }; });
              setAddRows(r);
            }
            setShowAdd((s) => !s);
          }}
          size="lg"
          className={`mb-3 w-full rounded-xl ${
            showAdd ? "border border-border text-muted hover:bg-panel2" : "border border-teal/40 bg-teal/10 text-teal hover:bg-teal/20"
          }`}
        >
          {showAdd ? "✕ Kapat" : "➕ Yeni Bakım Türü Ekle"}
        </Button>

        {showAdd && (
          <MaintenanceTypeAddForm
            engines={sortedEngines}
            rows={addRows}
            label={newLabel}
            period={newPeriod}
            workDomains={newWorkDomains}
            allowElectromechanicalSupport={newAllowElectromechanicalSupport}
            allowElectromechanicalResponsible={newAllowElectromechanicalResponsible}
            saving={saving}
            onLabelChange={setNewLabel}
            onPeriodChange={setNewPeriod}
            onToggleDomain={(domain) => toggleDomain(newWorkDomains, setNewWorkDomains, domain)}
            onAllowElectromechanicalSupportChange={setNewAllowElectromechanicalSupport}
            onAllowElectromechanicalResponsibleChange={setNewAllowElectromechanicalResponsible}
            onToggleIncluded={(engineId, included) => setAddRows((prev) => ({ ...prev, [engineId]: { last: prev[engineId]?.last ?? "", period: prev[engineId]?.period ?? "", included } }))}
            onRowChange={setAddRow}
            onSave={addType}
          />
        )}

        {sortedTypes.length === 0 ? (
          <EmptyState title="Henüz bakım türü eklenmemiş." icon="🧰" />
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:items-start">
            {sortedTypes.map((type) => (
              <MaintenanceTypeCard
                key={type.key}
                type={type}
                engineCount={Object.keys(type.engine_states || {}).length}
                engines={sortedEngines}
                editing={editingKey === type.key}
                editLabel={editLabel}
                editPeriod={editPeriod}
                editWorkDomains={editWorkDomains}
                editAllowElectromechanicalSupport={editAllowElectromechanicalSupport}
                editAllowElectromechanicalResponsible={editAllowElectromechanicalResponsible}
                editRows={editRows}
                savingEdit={savingEdit}
                confirmDelete={confirmDeleteKey === type.key}
                onStartEdit={startEdit}
                onRequestDelete={() => setConfirmDeleteKey(type.key)}
                onConfirmDelete={() => doDelete(type.key)}
                onCancelDelete={() => setConfirmDeleteKey(null)}
                onEditLabelChange={setEditLabel}
                onEditPeriodChange={setEditPeriod}
                onToggleDomain={(domain) => toggleDomain(editWorkDomains, setEditWorkDomains, domain)}
                onAllowElectromechanicalSupportChange={setEditAllowElectromechanicalSupport}
                onAllowElectromechanicalResponsibleChange={setEditAllowElectromechanicalResponsible}
                onToggleIncluded={(engineId, included) => setEditRows((prev) => ({ ...prev, [engineId]: { last: prev[engineId]?.last ?? "", period: prev[engineId]?.period ?? "", included } }))}
                onRowChange={setEditRow}
                onCancelEdit={() => setEditingKey(null)}
                onSave={() => saveEdit(type.key)}
              />
            ))}
          </div>
        )}

        <ArchivedMaintenanceTypes
          types={sortedArchivedTypes}
          restoringKey={restoringKey}
          onRestore={restoreType}
        />
      </div>
      <BottomNav />
    </div>
  );
}
