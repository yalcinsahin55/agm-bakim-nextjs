"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface LoginForm {
  identifier: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState<LoginForm>({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [redirectPath, setRedirectPath] = useState("/dashboard");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectTo = params.get("redirect");
    if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) setRedirectPath(redirectTo);
  }, []);

  function handleField(field: keyof LoginForm) {
    return (event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Giriş yapılamadı.");
        return;
      }
      toast.success("Giriş başarılı, hoş geldiniz.");
      const destination = redirectPath === "/dashboard" && ["teknisyen", "planlamaci"].includes(data.user?.role) ? "/tamamla" : redirectPath;
      router.push(destination);
      router.refresh();
    } catch {
      toast.error("Sunucuya ulaşılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-md text-center animate-fade-in">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-border bg-gradient-to-br from-[#232d3a] to-panel text-4xl shadow-2xl">
          🔧
        </div>
        <div className="font-display text-3xl font-bold uppercase leading-tight tracking-wide">
          Avcıkoru <span className="text-amber">Motor Bakım Merkezi</span>
        </div>
        <p className="mt-2 text-xs text-faint">Profesyonel motor bakım takip sistemi</p>
      </div>

      <div className="mx-auto mt-8 w-full max-w-md rounded-2xl border border-border bg-panel/70 p-5 shadow-2xl backdrop-blur-xl animate-fade-in">
        <div className="mb-5 rounded-xl border border-teal/30 bg-teal/10 px-3 py-2.5 text-left text-[11px] text-muted">
          <div className="font-bold text-teal">Telefon ile güvenli giriş</div>
          <div className="mt-0.5 leading-relaxed">Telefon numaranızı ve yöneticinizin oluşturduğu şifrenizi kullanın.</div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-left text-[10px] font-bold uppercase tracking-wide text-muted">Telefon numarası veya e-posta</label>
          <input
            required
            autoComplete="username"
            inputMode="tel"
            placeholder="05xx xxx xx xx"
            value={form.identifier}
            onChange={handleField("identifier")}
            className="rounded-xl border border-border bg-panel2 px-4 py-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
          <label className="mt-1 text-left text-[10px] font-bold uppercase tracking-wide text-muted">Şifre</label>
          <input
            required
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={form.password}
            onChange={handleField("password")}
            className="rounded-xl border border-border bg-panel2 px-4 py-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
          <button
            disabled={loading}
            type="submit"
            className="mt-2 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber py-3.5 text-sm font-extrabold text-[#1a1206] shadow-lg transition hover:brightness-110 active:scale-[.98] disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a1206]/40 border-t-[#1a1206]" /> Giriş yapılıyor...</span>
            ) : "Giriş Yap"}
          </button>
        </form>
        <p className="mt-4 text-center text-[10.5px] leading-relaxed text-faint">
          Yeni kullanıcı hesaplarını yalnızca yönetici oluşturur. Hesabınız yoksa yöneticinizle iletişime geçin.
        </p>
      </div>
    </div>
  );
}
