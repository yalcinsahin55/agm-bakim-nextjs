"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { canAccessRoute, defaultRouteForRole } from "@/lib/permissions";
import { invalidateCachedFetch } from "@/lib/apiCache";
import { notifyAuthChanged } from "@/lib/authClient";

interface LoginForm {
  identifier: string;
  password: string;
}

function formatRetryAfter(seconds: number): string {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} dk` : `${seconds} sn`;
}

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState<LoginForm>({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [redirectPath, setRedirectPath] = useState("/dashboard");
  const [hydrated, setHydrated] = useState(false);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectTo = params.get("redirect");
    if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) setRedirectPath(redirectTo);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (retryUntil === null) {
      setRetryAfterSeconds(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000));
      setRetryAfterSeconds(remaining);
      if (remaining === 0) setRetryUntil(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  function handleField(field: keyof LoginForm) {
    return (event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retryAfterSeconds > 0) {
      toast.error(`Çok fazla deneme. ${formatRetryAfter(retryAfterSeconds)} sonra tekrar deneyin.`);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; user?: { role?: unknown } };
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After") || "0");
          if (Number.isFinite(retryAfter) && retryAfter > 0) setRetryUntil(Date.now() + retryAfter * 1000);
          toast.error(retryAfter > 0 ? `${data.error || "Çok fazla deneme."} ${formatRetryAfter(retryAfter)} sonra tekrar deneyin.` : (data.error || "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin."));
        } else {
          toast.error(data.error || "Giriş yapılamadı.");
        }
        return;
      }
      setRetryUntil(null);
      // Aynı tarayıcıda rol değiştirirken önceki kullanıcının /api/auth/me cevabı
      // 30 saniyelik cache'ten gelmesin; menü ve RoleGuard yeni hesabı görsün.
      invalidateCachedFetch("/api/auth/me");
      notifyAuthChanged();
      toast.success("Giriş başarılı, hoş geldiniz.");

      const role = typeof data.user?.role === "string" ? data.user.role : undefined;
      const roleDefault = defaultRouteForRole(role);
      const requestedDestination = redirectPath;
      const isSharedLanding = requestedDestination === "/dashboard" || requestedDestination === "/tamamla";
      const destination = !isSharedLanding && canAccessRoute(role, requestedDestination)
        ? requestedDestination
        : roleDefault;

      router.replace(destination);
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
        <form onSubmit={submit} data-login-hydrated={hydrated ? "true" : "false"} className="flex flex-col gap-3">
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
            disabled={loading || retryAfterSeconds > 0}
            type="submit"
            className="mt-2 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber py-3.5 text-sm font-extrabold text-[#1a1206] shadow-lg transition hover:brightness-110 active:scale-[.98] disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a1206]/40 border-t-[#1a1206]" /> Giriş yapılıyor...</span>
            ) : retryAfterSeconds > 0 ? `Tekrar deneyin (${formatRetryAfter(retryAfterSeconds)})` : "Giriş Yap"}
          </button>
        </form>
        <p className="mt-4 text-center text-[10.5px] leading-relaxed text-faint">
          Yeni kullanıcı hesaplarını yalnızca yönetici oluşturur. Hesabınız yoksa yöneticinizle iletişime geçin.
        </p>
      </div>
    </div>
  );
}
