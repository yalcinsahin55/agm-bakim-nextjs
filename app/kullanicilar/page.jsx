"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { ROLE_LABELS } from "@/lib/status";

const ROLES = ["yonetici", "planlamaci", "teknisyen", "goruntuleyici"];

export default function KullanicilarPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "teknisyen" });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/users");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { setLoading(false); setUsers(null); return; }
    setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function addUser() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setMessage({ ok: true, text: "Kullanıcı eklendi." });
      setForm({ full_name: "", email: "", password: "", role: "teknisyen" });
      setShowForm(false);
      load();
    } else {
      const data = await res.json();
      setMessage({ ok: false, text: data.error || "Bir hata oluştu." });
    }
  }

  async function updateUser(id, patch) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    load();
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  if (users === null) {
    return (
      <div>
        <TopBar title="Kullanıcılar" />
        <div className="px-4 py-4">
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">Bu sayfa yalnızca yöneticiler içindir.</div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Kullanıcılar" subtitle={`${users.length} kullanıcı`} />
      <div className="px-4 py-4">
        <button onClick={() => setShowForm((s) => !s)} className="w-full py-3 rounded-xl border border-teal/40 bg-teal/10 text-teal font-bold text-[13px] mb-3">
          {showForm ? "Kapat" : "➕ Yeni Kullanıcı Ekle"}
        </button>

        {showForm && (
          <div className="bg-panel border border-border rounded-card p-3.5 mb-4 flex flex-col gap-2">
            <input placeholder="Adı Soyadı" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm" />
            <input type="email" placeholder="E-posta" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm" />
            <input type="password" placeholder="Şifre" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            {message && <div className={`text-[12px] ${message.ok ? "text-green" : "text-red"}`}>{message.text}</div>}
            <button onClick={addUser} disabled={saving} className="py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50">
              {saving ? "Ekleniyor..." : "Kullanıcı Oluştur"}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className="bg-panel border border-border rounded-card p-3.5">
              <div className="text-[13px] font-bold text-text">{u.full_name}</div>
              <div className="text-[11px] text-faint mb-2">{u.email}</div>
              <div className="flex gap-2 items-center">
                <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })} className="flex-1 bg-panel2 border border-border rounded-lg px-2 py-2 text-[12px]">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-[11px] text-muted flex-shrink-0">
                  <input type="checkbox" checked={u.active} onChange={(e) => updateUser(u.id, { active: e.target.checked })} />
                  Aktif
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
