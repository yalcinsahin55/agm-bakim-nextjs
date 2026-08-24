"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { ROLE_LABELS } from "@/lib/status";
import { useCurrentUser } from "@/lib/useCurrentUser";

const ROLES = ["yonetici", "teknisyen", "goruntuleyici"];
const TECHNICIAN_TYPES = [
  { value: "mekanik", label: "Mekanik teknisyen" },
  { value: "elektromekanik", label: "Elektromekanik teknisyen" },
];

type UserRow = {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  role: string;
  technician_type?: string;
  approved?: boolean;
  active?: boolean;
};

type UserStatusFilter = "all" | "active" | "inactive";

const ROLE_COLORS = {
  yonetici: "text-amber bg-amber/10 border-amber/30",
  planlamaci: "text-teal bg-teal/10 border-teal/30",
  teknisyen: "text-green bg-green/10 border-green/30",
  goruntuleyici: "text-muted bg-panel2 border-border",
};

function initials(name) {
  return (name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function KullanicilarPage() {
  const router = useRouter();
  const { user: currentUser } = useCurrentUser();
  const [users, setUsers] = useState<UserRow[] | null>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", password: "", role: "teknisyen", technician_type: "mekanik" });
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [loadError, setLoadError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 403) { setLoadError(""); setUsers(null); return; }
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        setUsers([]);
        setLoadError(data?.error || "Kullanıcı listesi yüklenemedi.");
        return;
      }
      setLoadError("");
      setUsers(data as UserRow[]);
    } catch {
      setUsers([]);
      setLoadError("Kullanıcı listesi yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [router]);

  async function addUser() {
    setSaving(true);
    const loadingToast = toast.loading("Kullanıcı oluşturuluyor...");
    try {
      const res = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Kullanıcı eklendi! 👥");
        setForm({ full_name: "", phone: "", password: "", role: "teknisyen", technician_type: "mekanik" });
        setShowForm(false);
        load();
      } else {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.error(data.error || "Kullanıcı eklenemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(id, patch) {
    const loadingToast = toast.loading("Güncelleniyor...");
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.dismiss(loadingToast);
        toast.error(data.error || "Kullanıcı güncellenemedi.");
        return;
      }
      toast.dismiss(loadingToast);
      toast.success("Kullanıcı güncellendi! ✅");
      load();
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    }
  }

  async function deleteUser(u) {
    const loadingToast = toast.loading("Kullanıcı kalıcı olarak siliniyor...");
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.dismiss(loadingToast);
        toast.error(data.error || "Kullanıcı silinemedi.");
        return;
      }
      toast.dismiss(loadingToast);
      toast.success("Kullanıcı kalıcı olarak silindi; bakım geçmişi korundu.");
      setConfirmDeleteId(null);
      load();
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Kullanıcılar" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-3" />
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2">
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <TopBar title="Kullanıcılar" />
        <div className="px-4 py-4">
          <div className="text-center py-12 bg-panel border border-red/30 rounded-card">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-red">{loadError}</p>
            <button onClick={() => { setLoading(true); void load(); }} className="mt-4 rounded-xl border border-teal/40 bg-teal/10 px-4 py-2.5 text-sm font-bold text-teal">Tekrar dene</button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const activeUserCount = users?.filter((item) => item.active !== false).length || 0;
  const pendingUserCount = users?.filter((item) => !item.approved).length || 0;
  const technicianCount = users?.filter((item) => item.role === "teknisyen" || item.role === "planlamaci").length || 0;
  const visibleUsers = users?.filter((item) => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    const matchesSearch = !needle || [item.full_name, item.phone, item.email].filter(Boolean).some((value) => String(value).toLocaleLowerCase("tr-TR").includes(needle));
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? item.active !== false : item.active === false);
    const matchesRole = roleFilter === "all" || item.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  }) || [];

  if (users === null) {
    return (
      <div>
        <TopBar title="Kullanıcılar" />
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
      <TopBar title="Kullanıcılar" subtitle={`${visibleUsers.length}/${users.length} kullanıcı`} />
      <div className="px-4 py-4">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-green/30 bg-green/10 px-2.5 py-2.5"><div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">Aktif</div><div className="mt-1 font-mono text-lg font-bold text-green">{activeUserCount}</div></div>
          <div className="rounded-xl border border-amber/30 bg-amber/10 px-2.5 py-2.5"><div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">Onay bekliyor</div><div className="mt-1 font-mono text-lg font-bold text-amber">{pendingUserCount}</div></div>
          <div className="rounded-xl border border-teal/30 bg-teal/10 px-2.5 py-2.5"><div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">Teknisyen</div><div className="mt-1 font-mono text-lg font-bold text-teal">{technicianCount}</div></div>
        </div>
        <div className="mb-3 rounded-card border border-border bg-panel p-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kullanıcı ara..." aria-label="Kullanıcı ara" className="w-full min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20" />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatusFilter)} aria-label="Kullanıcı durum filtresi" className="min-w-0 rounded-xl border border-border bg-panel2 px-2.5 py-2 text-[11px] font-bold text-text outline-none focus:border-teal">
              <option value="all">Tüm durumlar</option><option value="active">Aktif</option><option value="inactive">Pasif</option>
            </select>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Kullanıcı rol filtresi" className="min-w-0 rounded-xl border border-border bg-panel2 px-2.5 py-2 text-[11px] font-bold text-text outline-none focus:border-teal">
              <option value="all">Tüm roller</option>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
            <span className="col-span-2 self-center text-[10px] text-faint sm:col-span-1 sm:text-right">{visibleUsers.length} kayıt gösteriliyor</span>
          </div>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className={`w-full py-3 rounded-xl font-bold text-[13px] mb-3 transition-all ${
            showForm ? "border border-border text-muted hover:bg-panel2" : "border border-teal/40 bg-teal/10 text-teal hover:bg-teal/20"
          }`}
        >
          {showForm ? "✕ Kapat" : "➕ Yeni Kullanıcı Ekle"}
        </button>

        {showForm && (
          <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 flex flex-col gap-2 animate-fade-in">
            <input placeholder="👤 Adı Soyadı" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
            <input type="tel" inputMode="tel" placeholder="📱 Telefon (05xx xxx xx xx)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
            <input type="password" placeholder="🔒 Şifre" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            {form.role === "teknisyen" && <select value={form.technician_type} onChange={(e) => setForm({ ...form, technician_type: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition">
              {TECHNICIAN_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>}
            <p className="text-[10px] leading-relaxed text-faint">Kullanıcı oluşturulduğunda erişimi kapalı olur. Kartındaki <b>Onayla</b> düğmesiyle hesabı kullanıma açabilirsiniz. Teknisyen türü performans raporlarında ayrı izlenir.</p>
            <button onClick={addUser} disabled={saving} className="py-3 rounded-xl bg-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                  Oluşturuluyor...
                </span>
              ) : "👤 Kullanıcı Oluştur"}
            </button>
          </div>
        )}

        <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:items-start">
          {visibleUsers.map((u) => (
            <div key={u.id} className="bg-panel border border-border rounded-card p-3.5 hover:border-teal/40 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#232d3a] to-panel border border-border flex items-center justify-center text-[12px] font-extrabold text-teal flex-shrink-0">
                  {initials(u.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-text truncate">{u.full_name}</div>
                  <div className="text-[11px] text-faint truncate">{u.phone || u.email || "Telefon tanımlanmamış"}</div>
                </div>
                <span className={`text-[9.5px] font-extrabold px-2 py-1 rounded-full border flex-shrink-0 ${ROLE_COLORS[u.role] || ROLE_COLORS.goruntuleyici}`}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2 py-1 text-[9.5px] font-extrabold ${u.approved ? "border-green/30 bg-green/10 text-green" : "border-amber/30 bg-amber/10 text-amber"}`}>
                  {u.approved ? "Onaylı erişim" : "Onay bekliyor"}
                </span>
                <button onClick={() => updateUser(u.id, { approved: !u.approved })} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${u.approved ? "border-border text-muted hover:bg-panel2" : "border-teal/40 bg-teal/10 text-teal hover:bg-teal/20"}`}>
                  {u.approved ? "Onayı kaldır" : "Onayla"}
                </button>
              </div>
              <div className="mb-2 flex min-w-0 items-center gap-2">
                <input type="tel" inputMode="tel" value={u.phone || ""} onChange={(e) => setUsers((current) => current.map((item) => item.id === u.id ? { ...item, phone: e.target.value } : item))} placeholder="Telefon" className="min-w-0 flex-1 bg-panel2 border border-border rounded-lg px-2 py-2 text-[11px] outline-none focus:border-teal transition" />
                <button onClick={() => updateUser(u.id, { phone: u.phone || "" })} className="shrink-0 whitespace-nowrap rounded-lg border border-teal/30 px-2.5 py-2 text-[10px] font-bold text-teal hover:bg-teal/10 transition">Kaydet</button>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })} className="w-full min-w-0 bg-panel2 border border-border rounded-lg px-2 py-2 text-[12px] outline-none focus:border-teal transition sm:min-w-[150px] sm:flex-1">
                  {u.role === "planlamaci" && <option value="planlamaci">{ROLE_LABELS.planlamaci}</option>}
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                {(u.role === "teknisyen" || u.role === "planlamaci") && <select value={u.technician_type || "mekanik"} onChange={(e) => updateUser(u.id, { technician_type: e.target.value })} className="w-full min-w-0 bg-panel2 border border-border rounded-lg px-2 py-2 text-[11px] outline-none focus:border-teal transition sm:min-w-[180px] sm:flex-1" aria-label={`${u.full_name} teknisyen türü`}>
                  {TECHNICIAN_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>}
                <label className="flex min-h-10 items-center gap-1.5 text-[11px] text-muted cursor-pointer sm:shrink-0">
                  <input type="checkbox" checked={u.active} onChange={(e) => updateUser(u.id, { active: e.target.checked })} />
                  Aktif
                </label>
                {u.id === currentUser?.id ? (
                  <button disabled className="w-full whitespace-nowrap text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-2 opacity-40 cursor-not-allowed sm:w-auto">Silinemez</button>
                ) : confirmDeleteId === u.id ? (
                  <>
                    <button onClick={() => deleteUser(u)} className="w-full whitespace-nowrap text-[11px] font-bold text-[#1a1206] bg-red rounded-lg px-2.5 py-2 hover:brightness-110 transition sm:w-auto">Evet, sil</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="w-full whitespace-nowrap text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-2 hover:bg-panel2 transition sm:w-auto">Vazgeç</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteId(u.id)} title="Bu kullanıcıyı kalıcı olarak sil" className="w-full whitespace-nowrap text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-2 hover:bg-red/10 transition sm:w-auto">Kalıcı sil</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {visibleUsers.length === 0 && (
          <div className="text-center py-12 bg-panel border border-border rounded-card">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-sm text-muted">{users.length === 0 ? "Henüz kullanıcı yok." : "Filtrelere uygun kullanıcı bulunamadı."}</p>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
