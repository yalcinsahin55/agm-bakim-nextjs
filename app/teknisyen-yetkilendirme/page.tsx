"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useAbortableFetch } from "@/lib/useAbortableFetch";
import { TECHNICIAN_TYPE_LABELS, WORK_DOMAIN_LABELS } from "@/lib/technicians";
import type { TechnicianType, WorkDomain } from "@/lib/types";

const TECHNICIAN_TYPES: TechnicianType[] = ["mekanik", "elektromekanik"];
const WORK_DOMAINS: WorkDomain[] = ["mechanical", "electrical", "commissioning"];
type FilterType = "all" | TechnicianType;
type FilterStatus = "all" | "active" | "pending";

type ManagedUser = {
  id: string;
  full_name: string;
  phone?: string;
  role: string;
  technician_type?: TechnicianType;
  can_be_responsible?: boolean;
  can_be_support?: boolean;
  allowed_work_domains?: WorkDomain[];
  active: boolean;
  approved: boolean;
};

function technicianType(value: unknown): TechnicianType {
  return value === "elektromekanik" ? "elektromekanik" : "mekanik";
}

function domainsFor(user: ManagedUser): WorkDomain[] {
  if (Array.isArray(user.allowed_work_domains) && user.allowed_work_domains.length) return user.allowed_work_domains;
  return user.technician_type === "elektromekanik" ? ["electrical", "commissioning"] : ["mechanical"];
}

export default function TechnicianAuthorizationPage() {
  const router = useRouter();
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const { signal } = useAbortableFetch();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/users", { cache: "no-store", signal });
      if (response.status === 401) { router.push("/login"); return; }
      if (response.status === 403) { setLoading(false); return; }
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Kullanıcı yetkileri yüklenemedi.");
    } finally {
      if (!signal.aborted) setLoading(false);
      }
  }, [router, signal]);

  useEffect(() => { void load(); }, [load]);

  async function updateUser(id: string, patch: Record<string, unknown>, success = "Yetki güncellendi.") {
    setSavingId(id);
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Yetki güncellenemedi.");
        return;
      }
      setUsers((current) => current.map((item) => item.id === id ? { ...item, ...patch, technician_type: patch.technician_type ? technicianType(patch.technician_type) : item.technician_type } : item));
      if (patch.technician_type !== undefined) void load();
      toast.success(success);
    } catch {
      toast.error("Sunucuya ulaşılamadı.");
    } finally {
      setSavingId(null);
    }
  }

  function toggleDomain(target: ManagedUser, domain: WorkDomain) {
    const current = domainsFor(target);
    const next = current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain];
    if (!next.length) {
      toast.error("En az bir çalışma alanı seçilmelidir.");
      return;
    }
    void updateUser(target.id, { allowed_work_domains: next });
  }

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return users
      .filter((item) => item.role === "teknisyen" || item.role === "planlamaci")
      .filter((item) => filterType === "all" || technicianType(item.technician_type) === filterType)
      .filter((item) => filterStatus === "all" || (filterStatus === "active" ? item.active && item.approved : !item.approved))
      .filter((item) => !needle || `${item.full_name} ${item.phone || ""}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [users, filterType, filterStatus, search]);

  if (userLoading || loading) {
    return <div><TopBar title="Teknisyen Yetkilendirme" subtitle="Yükleniyor" /><div className="px-4 py-4"><Skeleton className="h-24 rounded-card" /><Skeleton className="mt-3 h-48 rounded-card" /></div><BottomNav /></div>;
  }

  if (currentUser?.role !== "yonetici") {
    return <div><TopBar title="Teknisyen Yetkilendirme" subtitle="Yönetici erişimi gerekir" /><main className="px-4 py-8"><div className="rounded-card border border-red/30 bg-red/10 p-4 text-sm text-red">Bu ekran yalnızca yöneticiler tarafından kullanılabilir.</div></main><BottomNav /></div>;
  }

  const mechanics = users.filter((item) => (item.role === "teknisyen" || item.role === "planlamaci") && technicianType(item.technician_type) === "mekanik").length;
  const electromechanics = users.filter((item) => (item.role === "teknisyen" || item.role === "planlamaci") && technicianType(item.technician_type) === "elektromekanik").length;

  return (
    <div>
      <TopBar title="Teknisyen Yetkilendirme" subtitle="Uzmanlık, görev ve çalışma alanlarını yönet" />
      <main className="px-4 py-4 pb-28 md:ml-64 md:px-8 md:pb-6">
        <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 rounded-card border border-teal/30 bg-teal/5 p-3.5 text-[11px] leading-relaxed text-muted">
          <b className="text-teal">Bu ekran yalnızca yöneticilere açıktır.</b> Mekanik teknisyenler genel bakım işlerinde varsayılan sorumlu kabul edilir. Elektromekanik teknisyenler elektriksel işler ve devreye alma desteği için ayrılır; sorumlu olarak seçilmeleri ayrıca açılabilir.
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-card border border-teal/30 bg-teal/10 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-faint">Mekanik teknisyen</div><div className="mt-1 font-mono text-2xl font-bold text-teal">{mechanics}</div></div>
          <div className="rounded-card border border-purple-400/30 bg-purple-400/10 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-faint">Elektromekanik teknisyen</div><div className="mt-1 font-mono text-2xl font-bold text-purple-200">{electromechanics}</div></div>
        </div>

        <div className="mb-3 rounded-card border border-border bg-panel p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Teknisyen ara..." className="rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-teal" />
            <select value={filterType} onChange={(event) => setFilterType(event.target.value as FilterType)} className="rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-teal"><option value="all">Tüm türler</option>{TECHNICIAN_TYPES.map((item) => <option key={item} value={item}>{TECHNICIAN_TYPE_LABELS[item]}</option>)}</select>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as FilterStatus)} className="rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-teal"><option value="all">Tüm durumlar</option><option value="active">Aktif ve onaylı</option><option value="pending">Onay bekleyen</option></select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filteredUsers.map((item) => {
            const type = technicianType(item.technician_type);
            const domains = domainsFor(item);
            const saving = savingId === item.id;
            return <section key={item.id} className="h-full rounded-card border border-border bg-panel p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><div className="truncate text-[14px] font-bold text-text">{item.full_name}</div><div className="mt-0.5 text-[10.5px] text-faint">{item.phone || "Telefon yok"} · {item.role === "planlamaci" ? "Eski planlamacı" : "Teknisyen"}</div></div>
                <div className="flex items-center gap-1.5"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${item.active && item.approved ? "border-green/30 bg-green/10 text-green" : "border-amber/30 bg-amber/10 text-amber"}`}>{item.active && item.approved ? "Aktif" : item.approved ? "Pasif" : "Onay bekliyor"}</span>{saving && <span className="text-[10px] text-faint">Kaydediliyor...</span>}</div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-muted">Teknisyen türü<select value={type} onChange={(event) => void updateUser(item.id, { technician_type: event.target.value }, "Teknisyen türü güncellendi.")} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-normal normal-case outline-none focus:border-teal"><option value="mekanik">Mekanik teknisyen</option><option value="elektromekanik">Elektromekanik teknisyen</option></select></label>
                <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">Hesap durumu</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void updateUser(item.id, { active: !item.active })} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${item.active ? "border-green/30 text-green" : "border-border text-faint"}`}>{item.active ? "Aktif" : "Pasif"}</button><button type="button" onClick={() => void updateUser(item.id, { approved: !item.approved })} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${item.approved ? "border-teal/30 text-teal" : "border-amber/30 text-amber"}`}>{item.approved ? "Onaylı" : "Onayla"}</button></div></div>
              </div>

              <div className="mt-3 rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Görev yetkileri</div><div className="flex flex-wrap gap-2"><label className="flex items-center gap-1.5 text-[11px] text-text"><input type="checkbox" checked={item.can_be_responsible !== false} onChange={(event) => void updateUser(item.id, { can_be_responsible: event.target.checked })} />Sorumlu teknisyen olabilir</label><label className="flex items-center gap-1.5 text-[11px] text-text"><input type="checkbox" checked={item.can_be_support !== false} onChange={(event) => void updateUser(item.id, { can_be_support: event.target.checked })} />Yardımcı teknisyen olabilir</label></div></div>

              <div className="mt-3 rounded-lg border border-border bg-panel2 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Çalışma alanları</div><div className="flex flex-wrap gap-1.5">{WORK_DOMAINS.map((domain) => <button key={domain} type="button" onClick={() => toggleDomain(item, domain)} className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold transition ${domains.includes(domain) ? "border-teal/40 bg-teal/10 text-teal" : "border-border text-faint hover:text-muted"}`}>{domains.includes(domain) ? "✓ " : ""}{WORK_DOMAIN_LABELS[domain]}</button>)}</div><div className="mt-1.5 text-[9.5px] text-faint">Seçilen alanlar, bakım türü uyumu tanımlandığında sorumlu ve yardımcı listelerini sınırlar.</div></div>
            </section>;
          })}
          {!filteredUsers.length && <div className="rounded-card border border-dashed border-border p-8 text-center text-[12px] text-faint">Filtreye uygun teknisyen bulunamadı.</div>}
        </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
