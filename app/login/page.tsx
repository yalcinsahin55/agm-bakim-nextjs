"use client";

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface FormState {
  full_name: string;
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [form, setForm] = useState<FormState>({ full_name: "", email: "", password: "" });
  const [loading, setLoading] = useState<boolean>(false);
  const [redirectPath, setRedirectPath] = useState<string>("/dashboard");

  // ✏️ DÜZELTME: Suspense gerektirmeyen, hatasız redirect okuma
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirect");
      if (redirectTo && redirectTo.startsWith("/")) setRedirectPath(redirectTo);
    } catch {
      /* önemsenmez */
    }
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const url = tab === "login" ? "/api/auth/login" : "/api/auth/register";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Bir hata oluştu.");
        return;
      }
      toast.success(tab === "login" ? "Giriş başarılı, hoş geldiniz! 👋" : "Hesabınız oluşturuldu! 🎉");
      router.push(redirectPath);
      router.refresh();
    } catch {
      toast.error("Sunucuya ulaşılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  function handleField(field: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: e.target.value });
  }

  return (
    <div className="flex flex-col min-h-screen justify-center px-6 py-10">
      {/* Animated logo */}
      <div className="text-center mb-8 animate-fade-in">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-[#232d3a] to-panel border border-borderlt flex items-center justify-center shadow-2xl mb-4 relative">
          <span className="text-4xl">🔧</span>
          <span className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-amber border-2 border-[#0f1319] flex items-center justify-center text-[13px]">⚙️</span>
        </div>
        <div className="font-display text-3xl font-bold uppercase tracking-wide leading-tight">
          Avcıkoru Santrali <span className="text-amber">Motor Bakım Merkezi</span>
        </div>
        <p className="text-faint text-xs mt-2">Profesyonel motor bakım takip sistemi</p>
      </div>

      {/* Glass-effect card */}
      <div className="bg-panel/70 backdrop-blur-xl border border-border rounded-2xl p-5 shadow-2xl animate-fade-in">
        <div className="flex gap-1 bg-[#12161d] p-1 rounded-xl border border-border mb-5">
          <button
            onClick={() => setTab("login")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${tab === "login" ? "bg-amber text-[#161006] shadow-lg" : "text-faint hover:text-muted"}`}
          >
            Giriş Yap
          </button>
          <button
            onClick={() => setTab("register")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${tab === "register" ? "bg-amber text-[#161006] shadow-lg" : "text-faint hover:text-muted"}`}
          >
            Yeni Hesap
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {tab === "register" && (
            <input
              required placeholder="👤  Adınız Soyadınız" value={form.full_name}
              onChange={handleField("full_name")}
              className="bg-panel2 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            />
          )}
          <input
            required type="email" placeholder="✉️  E-posta" value={form.email}
            onChange={handleField("email")}
            className="bg-panel2 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
          <input
            required type="password" placeholder="🔒  Şifre" value={form.password}
            onChange={handleField("password")}
            className="bg-panel2 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
          <button
            disabled={loading} type="submit"
            className="mt-2 py-3.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-sm shadow-lg disabled:opacity-60 transition hover:brightness-110 active:scale-[.98]"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                İşleniyor...
              </span>
            ) : tab === "login" ? "Giriş Yap" : "Hesap Oluştur"}
          </button>
        </form>
      </div>

      {tab === "register" && (
        <p className="text-faint text-[11px] text-center mt-4 leading-relaxed px-2 animate-fade-in">
          Hesaplar yalnızca yönetici tarafından oluşturulur. Erişim için yöneticinizle iletişime geçin.
        </p>
      )}
    </div>
  );
}
