"use client";

interface RecordPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function RecordPagination({ page, totalPages, onPageChange }: RecordPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-panel p-2">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted disabled:opacity-40"
      >
        ← Önceki
      </button>
      <span className="text-[11px] text-faint">{page} / {totalPages}</span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted disabled:opacity-40"
      >
        Sonraki →
      </button>
    </div>
  );
}
