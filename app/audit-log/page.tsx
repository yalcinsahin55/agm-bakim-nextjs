"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";

interface AuditItem {
  _id: string;
  user_name: string;
  user_role: string;
  action: string;
  entity: string;
  entity_id?: string;
  summary: string;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  create: "Oluşturma",
  update: "Güncelleme",
  delete: "Silme",
  login: "Giriş",
  export: "Dışa aktarma",
  upload: "Yükleme",
};

export default function AuditLogPage() {
  const router = useRouter();
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState("Tümü");
  const [entityFilter, setEntityFilter] = useState("Tümü");

  async function load(nextPage = 1) {
    const params = new URLSearchParams({ page: String(nextPage), page_size: "30" });
    if (actionFilter !== "Tümü") params.set("action", actionFilter);
    if (entityFilter !== "Tümü") params.set("entity", entityFilter);
    const res = await fetch(`/api/audit-logs?${params.toString()}`);
    if (res.status === 401) return router.push("/login");
    if (res.status === 403) return router.push("/dashboard");
    const data = await res.json();
    setItems(data.items || []);
    setPage(data.page || nextPage);
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }

  useEffect(() => { load(1); }, [actionFilter, entityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <><TopBar title="İşlem Geçmişi" subtitle="Yükleniyor..." /><div className="p-4"><Skeleton className="h-20 rounded-card" /></div><BottomNav /></>;

  return (
    <div>
      <TopBar title="İşlem Geçmişi" subtitle="Yönetici denetim kaydı" />
      <main className="px-4 py-4">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="rounded-xl border border-border bg-panel2 px-2.5 py-2.5 text-[12px] outline-none focus:border-teal">
            <option value="Tümü">Tüm eylemler</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} className="rounded-xl border border-border bg-panel2 px-2.5 py-2.5 text-[12px] outline-none focus:border-teal">
            <option value="Tümü">Tüm kayıt türleri</option>
            <option value="maintenance_record">Bakım kayıtları</option>
            <option value="engine">Motorlar</option>
            <option value="oil_analysis">Yağ analizleri</option>
            <option value="user">Kullanıcılar</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <div className="rounded-card border border-border bg-panel p-8 text-center text-muted">Henüz işlem kaydı bulunmuyor.</div>
          ) : items.map((item) => (
            <article key={item._id} className="rounded-card border border-border bg-panel p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-bold text-text">{item.summary}</div>
                  <div className="mt-1 text-[11px] text-muted">{item.user_name} · {item.user_role}</div>
                </div>
                <span className="rounded-full border border-teal/30 px-2 py-1 text-[10px] font-bold text-teal">{actionLabels[item.action] || item.action}</span>
              </div>
              <div className="mt-2 text-[10.5px] text-faint">{item.entity}{item.entity_id ? ` · ${item.entity_id}` : ""} · {new Date(item.created_at).toLocaleString("tr-TR")}</div>
            </article>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-panel p-2">
            <button onClick={() => load(page - 1)} disabled={page <= 1} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted disabled:opacity-40">← Önceki</button>
            <span className="text-[11px] text-faint">{page} / {totalPages}</span>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted disabled:opacity-40">Sonraki →</button>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
