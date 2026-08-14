"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const url = tab === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Bir hata oluştu.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col min-h-screen justify-center px-6 py-10">
      <div className="text-center mb-8">
        <div className="font-display text-3xl font-bold uppercase tracking-wide leading-tight">
          AGM Motor <span className="text-amber">Bakım Merkezi</span>
        </div>
        <p className="text-faint text-xs mt-2">Profesyonel motor bakım takip sistemi</p>
      </div>

      <div className="flex gap-1 bg-[#12161d] p-1 rounded-xl border border-border mb-5">
        <button
          onClick={() => setTab("login")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${tab === "login" ? "bg-amber text-[#161006]" : "text-faint"}`}
        >
          Giriş Yap
        </button>
        <button
          onClick={() => setTab("register")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${tab === "register" ? "bg-amber text-[#161006]" : "text-faint"}`}
        >
          Yeni Hesap
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {tab === "register" && (
          <input
            required placeholder="Adınız Soyadınız" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="bg-panel2 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-teal"
          />
        )}
        <input
          required type="email" placeholder="E-posta" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="bg-panel2 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-teal"
        />
        <input
          required type="password" placeholder="Şifre" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="bg-panel2 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-teal"
        />
        {error && <div className="text-red text-xs">{error}</div>}
        <button
          disabled={loading} type="submit"
          className="mt-2 py-3.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-sm shadow-lg disabled:opacity-60"
        >
          {loading ? "..." : tab === "login" ? "Giriş Yap" : "Hesap Oluştur"}
        </button>
      </form>

      {tab === "register" && (
        <p className="text-faint text-[11px] text-center mt-4 leading-relaxed px-2">
          Sistemde ilk kayıt olan kişi otomatik yönetici olur. Sonraki kayıtlar teknisyen rolüyle başlar;
          bir yönetici daha sonra Kullanıcılar sayfasından rolünüzü değiştirebilir.
        </p>
      )}
    </div>
  );
}
