"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import EngineBadge from "@/components/EngineBadge";
import { engineSortKey } from "@/lib/status";
import { ApiFetchError, cachedFetch } from "@/lib/apiCache";

interface SummaryEntry {
  _id: string;
  created_at: string | Date;
  hour_at_completion: number;
  technician_name?: string;
}

interface SummaryGroup {
  key: string;
  engine_id: string;
  engine_name: string;
  type_key: string;
  type_label: string;
  count: number;
  first: SummaryEntry;
  last: SummaryEntry;
  average_interval: number | null;
}

interface DetailRecord extends SummaryEntry {
  type_label: string;
}

interface GroupDetails {
  records: DetailRecord[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AraliklarPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<SummaryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [engineFilter, setEngineFilter] = useState("Tümü");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, GroupDetails>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  useEffect(() => {
    cachedFetch<{ groups: SummaryGroup[] }>("/api/records/interval-summary", 15_000)
      .then((data) => setGroups(data.groups || []))
      .catch((error) => {
        if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function loadDetails(group: SummaryGroup, page = 1) {
    setDetailLoading(group.key);
    try {
      const params = new URLSearchParams({
        engine_id: group.engine_id,
        type_key: group.type_key,
        sort: "asc",
        page: String(page),
        page_size: "50",
      });
      const res = await fetch(`/api/records?${params.toString()}`);
      if (!res.ok) throw new ApiFetchError(res.status);
      const data = await res.json() as { records: DetailRecord[]; total: number; page: number; totalPages: number };
      setDetails((current) => ({
        ...current,
        [group.key]: {
          records: data.records || [],
          total: data.total || 0,
          page: data.page || page,
          totalPages: data.totalPages || 1,
        },
      }));
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
    } finally {
      setDetailLoading(null);
    }
  }

  function toggleGroup(group: SummaryGroup) {
    const willExpand = expandedKey !== group.key;
    setExpandedKey(willExpand ? group.key : null);
    if (willExpand && !details[group.key]) void loadDetails(group);
  }

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => engineSortKey(a.engine_name) - engineSortKey(b.engine_name) || a.type_label.localeCompare(b.type_label, "tr")),
    [groups],
  );
  const engineNames = useMemo(
    () => Array.from(new Set(groups.map((group) => group.engine_name))).sort((a, b) => engineSortKey(a) - engineSortKey(b)),
    [groups],
  );
  const filteredGroups = engineFilter === "Tümü" ? sortedGroups : sortedGroups.filter((group) => group.engine_name === engineFilter);

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Aralıkları" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-4" />
          <div className="flex flex-col gap-3"><Skeleton className="h-40 rounded-card" /><Skeleton className="h-40 rounded-card" /></div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div>
        <TopBar title="Bakım Aralıkları" />
        <div className="px-4 py-4">
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">⏱️</div>
            <p className="text-sm text-muted">Henüz tamamlanmış bakım yok.</p>
            <p className="text-xs text-faint mt-1">İlk bakımı kaydettiğinizde burada birikmeye başlayacak.</p>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Aralıkları" subtitle={`${filteredGroups.length} grup listeleniyor`} />
      <div className="px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
          <button onClick={() => setEngineFilter("Tümü")} className={`flex-shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold transition-all ${engineFilter === "Tümü" ? "bg-amber text-[#161006] shadow-lg" : "bg-panel2 text-muted border border-border hover:text-text"}`}>Tüm Motorlar</button>
          {engineNames.map((name) => <button key={name} onClick={() => setEngineFilter(name)} className={`flex-shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold transition-all ${engineFilter === name ? "bg-amber text-[#161006] shadow-lg" : "bg-panel2 text-muted border border-border hover:text-text"}`}>{name}</button>)}
        </div>

        <div className="flex flex-col gap-3">
          {filteredGroups.map((group) => {
            const groupDetails = details[group.key];
            const expanded = expandedKey === group.key;
            const entries = groupDetails?.records || [];
            return (
              <section key={group.key} className="bg-panel border border-border rounded-card overflow-hidden hover:border-borderlt transition-all animate-fade-in">
                <button type="button" onClick={() => toggleGroup(group)} className="w-full text-left flex items-center justify-between gap-2 p-3 bg-panel2 border-b border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <EngineBadge name={group.engine_name} size={26} />
                    <div className="min-w-0"><div className="text-[12.5px] font-bold text-text truncate">{group.type_label}</div><div className="text-[10.5px] text-faint">{group.engine_name} · {group.count} kayıt</div></div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {group.average_interval !== null && <div className="text-right"><div className="font-mono text-[14px] font-bold text-amber">{group.average_interval.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} sa</div><div className="text-[8.5px] text-faint uppercase">Ortalama</div></div>}
                    <span className="text-muted text-sm" aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
                  </div>
                </button>

                {!expanded && <div className="px-3 py-2.5 text-[11px] text-muted">Detay kayıtlarını görmek için grubu açın.</div>}
                {expanded && detailLoading === group.key && <div className="px-3 py-3 text-[11px] text-muted">Kayıtlar yükleniyor...</div>}
                {expanded && detailLoading !== group.key && (
                  <>
                    {entries.map((entry, index) => {
                      const previous = index > 0 ? entries[index - 1] : null;
                      const delta = previous ? entry.hour_at_completion - previous.hour_at_completion : null;
                      return <div key={entry._id} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border last:border-b-0 hover:bg-panel2/50 transition-colors"><div className="w-5 h-5 rounded-full bg-green/10 flex items-center justify-center flex-shrink-0"><span className="text-[10px] font-extrabold text-green">{(groupDetails?.page ? (groupDetails.page - 1) * 50 : 0) + index + 1}</span></div><div className="flex-1 text-[11.5px] text-text min-w-0">{new Date(entry.created_at).toLocaleDateString("tr-TR")} · {entry.hour_at_completion.toLocaleString("tr-TR")} sa{entry.technician_name ? ` · ${entry.technician_name}` : ""}</div>{delta === null ? <span className="text-[10.5px] font-bold text-faint">MİLAD</span> : <span className="font-mono text-[12.5px] font-bold text-teal">{delta.toLocaleString("tr-TR")} sa</span>}</div>;
                    })}
                    {groupDetails && groupDetails.totalPages > 1 && <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border"><button type="button" disabled={groupDetails.page <= 1} onClick={() => void loadDetails(group, groupDetails.page - 1)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted disabled:opacity-40">Önceki</button><span className="text-[11px] text-muted">Sayfa {groupDetails.page} / {groupDetails.totalPages}</span><button type="button" disabled={groupDetails.page >= groupDetails.totalPages} onClick={() => void loadDetails(group, groupDetails.page + 1)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted disabled:opacity-40">Sonraki</button></div>}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
