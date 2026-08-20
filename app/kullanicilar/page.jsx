"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { ROLE_LABELS } from "@/lib/status";
import { useCurrentUser } from "@/lib/useCurrentUser";

const ROLES = ["yonetici", "planlamaci", "teknisyen", "goruntuleyici"];

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
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "teknisyen" });
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function load() {
    const res = await fetch("/api/users");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { setLoading(false); setUsers(null); return; }
    setUsers(await res.json());
    setLoading(false);
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
        setForm({ full_name: "", email: "", password: "", role: "teknisyen" });
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

  async function doDelete(u) {
    const loadingToast = toast.loading("Kullanıcı siliniyor...");
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.dismiss(loadingToast);
        toast.error(data.error || "Kullanıcı silinemedi.");
        return;
      }
      toast.dismiss(loadingToast);
      toast.success("Kullanıcı silindi! 🗑️");
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
      <TopBar title="Kullanıcılar" subtitle={`${users.length} kullanıcı`} />
      <div className="px-4 py-4">
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
            <input type="email" placeholder="✉️ E-posta" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
            <input type="password" placeholder="🔒 Şifre" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <button onClick={addUser} disabled={saving} className="py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">
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
          {users.map((u) => (
            <div key={u.id} className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#232d3a] to-panel border border-border flex items-center justify-center text-[12px] font-extrabold text-teal flex-shrink-0">
                  {initials(u.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-text truncate">{u.full_name}</div>
                  <div className="text-[11px] text-faint truncate">{u.email}</div>
                </div>
                <span className={`text-[9.5px] font-extrabold px-2 py-1 rounded-full border flex-shrink-0 ${ROLE_COLORS[u.role] || ROLE_COLORS.goruntuleyici}`}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </div>
              <div className="flex gap-2 items-center">
                <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })} className="flex-1 bg-panel2 border border-border rounded-lg px-2 py-2 text-[12px] outline-none focus:border-teal transition">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-[11px] text-muted flex-shrink-0 cursor-pointer">
                  <input type="checkbox" checked={u.active} onChange={(e) => updateUser(u.id, { active: e.target.checked })} />
                  Aktif
                </label>
                {u.id === currentUser?.id ? (
                  <button disabled className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-2 opacity-40 cursor-not-allowed">Sil</button>
                ) : confirmDeleteId === u.id ? (
                  <>
                    <button onClick={() => doDelete(u)} className="text-[11px] font-bold text-[#1a1206] bg-red rounded-lg px-2.5 py-2 hover:brightness-110 transition">Evet</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-2 hover:bg-panel2 transition">Vazgeç</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteId(u.id)} className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-2 hover:bg-red/10 transition">Sil</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {users.length === 0 && (
          <div className="text-center py-12 bg-panel border border-border rounded-card">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-sm text-muted">Henüz kullanıcı yok.</p>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
