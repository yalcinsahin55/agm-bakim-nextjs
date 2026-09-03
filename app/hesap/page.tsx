"use client";

import { Button, Input } from "@/components/ui";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { invalidateCachedFetch } from "@/lib/apiCache";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface PasswordForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

const INITIAL_FORM: PasswordForm = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

export default function HesapPage() {
  const router = useRouter();
  const { user, loading, error } = useCurrentUser();
  const [form, setForm] = useState<PasswordForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const loadingToast = toast.loading("Şifre değiştiriliyor...");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; requiresLogin?: boolean };
      if (!response.ok) {
        toast.dismiss(loadingToast);
        toast.error(data.error || "Şifre değiştirilemedi.");
        return;
      }
      toast.dismiss(loadingToast);
      toast.success("Şifreniz değiştirildi. Güvenlik için tekrar giriş yapın.");
      invalidateCachedFetch("/api/auth/me");
      setForm(INITIAL_FORM);
      router.replace("/login");
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Hesap ve Şifre" />
        <div className="px-4 py-4">
          <div className="mx-auto max-w-xl animate-pulse rounded-card border border-border bg-panel p-5">
            <div className="h-5 w-40 rounded bg-panel2" />
            <div className="mt-3 h-4 w-64 rounded bg-panel2" />
            <div className="mt-6 h-11 rounded-xl bg-panel2" />
            <div className="mt-2 h-11 rounded-xl bg-panel2" />
            <div className="mt-2 h-11 rounded-xl bg-panel2" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div>
        <TopBar title="Hesap ve Şifre" />
        <div className="px-4 py-4">
          <div className="mx-auto max-w-xl rounded-card border border-red/30 bg-panel p-5 text-center">
            <div className="text-3xl">🔒</div>
            <p className="mt-3 text-sm text-red">{error || "Oturum gerekli."}</p>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Hesap ve Şifre" subtitle={user.full_name} />
      <div className="px-4 py-4">
        <section className="mx-auto max-w-xl rounded-card border border-border bg-panel p-4">
          <div className="border-b border-border pb-3">
            <h1 className="font-display text-lg font-bold uppercase tracking-wide">Şifre değiştir</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-faint">Mevcut şifrenizi doğruladıktan sonra yeni şifrenizi belirleyin. İşlem tamamlandığında açık olan oturumlar güvenlik amacıyla kapatılır.</p>
          </div>
          <form onSubmit={changePassword} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
              Mevcut şifre
              <Input
                type="password"
                value={form.current_password}
                onChange={(event) => setForm((current) => ({ ...current, current_password: event.target.value }))}
                autoComplete="current-password"
                minLength={6}
                maxLength={128}
                required
                className="rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm font-normal text-text outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
              Yeni şifre
              <Input
                type="password"
                value={form.new_password}
                onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))}
                autoComplete="new-password"
                minLength={6}
                maxLength={128}
                required
                className="rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm font-normal text-text outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
              Yeni şifre tekrarı
              <Input
                type="password"
                value={form.confirm_password}
                onChange={(event) => setForm((current) => ({ ...current, confirm_password: event.target.value }))}
                autoComplete="new-password"
                minLength={6}
                maxLength={128}
                required
                className="rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm font-normal text-text outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>
            <Button type="submit" disabled={saving} className="mt-1 rounded-xl bg-teal px-3 py-3 text-[13px] font-extrabold text-bg transition hover:brightness-110 disabled:opacity-50">
              {saving ? "Değiştiriliyor..." : "Şifremi değiştir"}
            </Button>
          </form>
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
