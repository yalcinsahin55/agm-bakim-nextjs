"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";

interface AuditItem {
  _id: string;
  user_id?: string;
  user_name: string;
  user_role: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  summary: string;
  created_at: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

interface AuditFilters {
  q: string;
  action: string;
  entity: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilters = { q: "", action: "", entity: "", from: "", to: "" };
const PAGE_SIZE = 25;

const actionLabels: Record<string, string> = {
  create: "Oluşturma",
  update: "Güncelleme",
  delete: "Silme",
  login: "Giriş",
  export: "Dışa aktarma",
  upload: "Yükleme",
};

const entityLabels: Record<string, string> = {
  maintenance_record: "Bakım kaydı",
  engine: "Motor",
  oil_analysis: "Yağ analizi",
  pressure_reading: "Karter basıncı",
  equipment_info: "Motor bilgi kartı",
  user: "Kullanıcı",
  backup: "Yedekleme",
};

const roleLabels: Record<string, string> = {
  yonetici: "Yönetici",
  planlamaci: "Teknisyen (eski Planlamacı)",
  teknisyen: "Teknisyen",
  goruntuleyici: "Görüntüleyici",
};

function actionClass(action: string): string {
  if (action === "delete") return "border-red/30 bg-red/10 text-red";
  if (action === "create") return "border-green/30 bg-green/10 text-green";
  if (action === "login") return "border-teal/30 bg-teal/10 text-teal";
  return "border-amber/30 bg-amber/10 text-amber";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Tarih bilinmiyor" : date.toLocaleString("tr-TR");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditLogPage() {
  const router = useRouter();
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<AuditItem | null>(null);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  async function load(nextPage = 1, nextFilters = filters, options: { silent?: boolean } = {}) {
    if (options.silent) setRefreshing(true);
    else setLoading(true);
    setError("");

    const params = new URLSearchParams({ page: String(nextPage), page_size: String(PAGE_SIZE), details: "0" });
    if (nextFilters.q) params.set("q", nextFilters.q);
    if (nextFilters.action) params.set("action", nextFilters.action);
    if (nextFilters.entity) params.set("entity", nextFilters.entity);
    if (nextFilters.from) params.set("from", nextFilters.from);
    if (nextFilters.to) params.set("to", nextFilters.to);

    try {
      const response = await fetch(`/api/audit-logs?${params.toString()}`);
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (response.status === 403) {
        router.push("/dashboard");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "İşlem geçmişi yüklenemedi.");
      setItems(Array.isArray(data.items) ? data.items : []);
      setPage(Number(data.page) || nextPage);
      setTotal(Number(data.total) || 0);
      setTotalPages(Number(data.totalPages) || 1);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "İşlem geçmişi yüklenemedi.";
      setError(message);
      if (options.silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(1, filters);
    // Filtre değiştiğinde sayfa başa alınır; load intentionally uses the snapshot above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function openDetails(item: AuditItem) {
    try {
      const params = new URLSearchParams({ id: item._id, page: "1", page_size: "1", details: "1" });
      const response = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!response.ok) throw new Error("İşlem ayrıntısı yüklenemedi.");
      const data = await response.json();
      setSelected(data.items?.[0] || item);
    } catch (detailError) {
      toast.error(detailError instanceof Error ? detailError.message : "İşlem ayrıntısı yüklenemedi.");
    }
  }

  function applyFilters() {
    const normalized = {
      ...draftFilters,
      q: draftFilters.q.trim(),
    };
    setFilters(normalized);
    setPage(1);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function updateDraft(field: keyof AuditFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [field]: value }));
  }

  if (loading) {
    return (
      <>
        <TopBar title="İşlem Geçmişi" subtitle="Yükleniyor..." />
        <main className="px-4 py-4">
          <Skeleton className="mb-3 h-28 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="mt-2 h-24 rounded-card" />
        </main>
        <BottomNav />
      </>
    );
  }

  return (
    <div>
      <TopBar title="İşlem Geçmişi" subtitle="Yönetici denetim kaydı" />
      <main className="px-4 py-4 pb-28">
        <section className="mb-3 rounded-card border border-border bg-panel p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-extrabold text-text">Denetim merkezi</div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-faint">Kullanıcı ve veri değişikliklerini tarih, işlem veya kayıt türüne göre inceleyin.</p>
            </div>
            <button
              type="button"
              onClick={() => load(page, filters, { silent: true })}
              disabled={refreshing}
              className="flex-shrink-0 rounded-lg border border-teal/30 px-2.5 py-2 text-[10.5px] font-bold text-teal transition hover:bg-teal/10 disabled:opacity-50"
            >
              {refreshing ? "Yenileniyor..." : "↻ Yenile"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-panel2 px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wide text-faint">Toplam kayıt</div>
              <div className="mt-0.5 font-mono text-lg font-bold text-amber">{total.toLocaleString("tr-TR")}</div>
            </div>
            <div className="rounded-xl border border-border bg-panel2 px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wide text-faint">Aktif filtre</div>
              <div className="mt-0.5 font-mono text-lg font-bold text-teal">{activeFilterCount}</div>
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-card border border-border bg-panel p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] font-bold text-text">Filtrele</div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className="text-[10px] font-bold text-muted hover:text-amber">Temizle</button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              value={draftFilters.q}
              onChange={(event) => updateDraft("q", event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }}
              placeholder="Kullanıcı, açıklama veya kayıt ID ara..."
              className="rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
            <div className="grid grid-cols-2 gap-2">
              <select value={draftFilters.action} onChange={(event) => updateDraft("action", event.target.value)} className="rounded-xl border border-border bg-panel2 px-2.5 py-2.5 text-[12px] outline-none focus:border-teal">
                <option value="">Tüm işlemler</option>
                {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={draftFilters.entity} onChange={(event) => updateDraft("entity", event.target.value)} className="rounded-xl border border-border bg-panel2 px-2.5 py-2.5 text-[12px] outline-none focus:border-teal">
                <option value="">Tüm kayıt türleri</option>
                {Object.entries(entityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold text-faint">Başlangıç
                <input type="date" value={draftFilters.from} onChange={(event) => updateDraft("from", event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-panel2 px-2.5 py-2.5 text-[12px] font-normal text-text outline-none focus:border-teal" />
              </label>
              <label className="text-[10px] font-bold text-faint">Bitiş
                <input type="date" value={draftFilters.to} onChange={(event) => updateDraft("to", event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-panel2 px-2.5 py-2.5 text-[12px] font-normal text-text outline-none focus:border-teal" />
              </label>
            </div>
            <button type="button" onClick={applyFilters} className="rounded-xl bg-gradient-to-b from-teal to-teal/80 py-2.5 text-[12px] font-extrabold text-[#06181b] transition hover:brightness-110 active:scale-[.98]">
              Filtreleri Uygula
            </button>
          </div>
        </section>

        {error && (
          <section className="mb-3 rounded-xl border border-red/30 bg-red/10 px-3 py-3 text-[11px] text-red">
            <div>{error}</div>
            <button type="button" onClick={() => load(page, filters, { silent: true })} className="mt-2 rounded-lg border border-red/30 px-2.5 py-1.5 font-bold">Tekrar dene</button>
          </section>
        )}

        <section className="flex flex-col gap-2">
          {items.length === 0 ? (
            <div className="rounded-card border border-border bg-panel p-8 text-center text-muted">
              <div className="mb-2 text-3xl">🧾</div>
              <div className="text-sm font-bold">Kayıt bulunamadı</div>
              <div className="mt-1 text-[11px] text-faint">Seçili filtreleri genişleterek tekrar deneyebilirsiniz.</div>
            </div>
          ) : items.map((item) => (
            <article key={item._id} className="rounded-card border border-border bg-panel p-3.5 transition hover:border-borderlt">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[13px] font-bold text-text">{item.summary || "İşlem kaydı"}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] text-muted">
                    <span className="font-semibold">{item.user_name || "Bilinmeyen kullanıcı"}</span>
                    <span className="text-faint">·</span>
                    <span>{roleLabels[item.user_role] || item.user_role}</span>
                  </div>
                </div>
                <span className={`flex-shrink-0 rounded-full border px-2 py-1 text-[9.5px] font-extrabold ${actionClass(item.action)}`}>
                  {actionLabels[item.action] || item.action}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-faint">
                <span>{entityLabels[item.entity] || item.entity}{item.entity_id ? ` · ${item.entity_id}` : ""}</span>
                <span>{formatDate(item.created_at)}</span>
              </div>
              <button type="button" onClick={() => openDetails(item)} className="mt-2.5 w-full rounded-lg border border-border px-2.5 py-2 text-[10.5px] font-bold text-muted transition hover:border-teal/40 hover:bg-teal/10 hover:text-teal">
                Ayrıntıları görüntüle
              </button>
            </article>
          ))}
        </section>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-panel p-2">
            <button type="button" onClick={() => load(page - 1, filters)} disabled={page <= 1 || loading} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted transition disabled:opacity-40">← Önceki</button>
            <span className="text-[11px] text-faint">{page} / {totalPages}</span>
            <button type="button" onClick={() => load(page + 1, filters)} disabled={page >= totalPages || loading} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted transition disabled:opacity-40">Sonraki →</button>
          </div>
        )}
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-text">İşlem ayrıntısı</div>
                <div className="mt-1 text-[10.5px] text-faint">{formatDate(selected.created_at)} · {entityLabels[selected.entity] || selected.entity}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="h-8 w-8 flex-shrink-0 rounded-full bg-panel2 text-lg text-muted transition hover:bg-red hover:text-white" aria-label="Kapat">✕</button>
            </div>
            <div className="overflow-y-auto px-4 py-3">
              <div className="rounded-xl border border-border bg-panel2 p-3">
                <div className="text-[12px] font-bold text-text">{selected.summary || "İşlem kaydı"}</div>
                <div className="mt-1 text-[10.5px] text-muted">{selected.user_name} · {roleLabels[selected.user_role] || selected.user_role}</div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-faint">Önceki değer</div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-[#0f1319] p-3 text-[10px] leading-relaxed text-muted">{formatValue(selected.before)}</pre>
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-faint">Sonraki değer</div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-[#0f1319] p-3 text-[10px] leading-relaxed text-muted">{formatValue(selected.after)}</pre>
                </div>
              </div>
              <div className="mt-3 text-[10px] text-faint">Kayıt ID: {selected._id}</div>
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
