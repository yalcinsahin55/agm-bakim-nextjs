"use client";

import { Button, Card } from "@/components/ui";

interface RecordPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function RecordPagination({ page, totalPages, onPageChange }: RecordPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <Card className="mt-4 flex items-center justify-between rounded-xl p-2">
      <Button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        variant="secondary"
        size="sm"
        className="text-muted disabled:opacity-40"
      >
        ← Önceki
      </Button>
      <span className="text-[11px] text-faint">{page} / {totalPages}</span>
      <Button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        variant="secondary"
        size="sm"
        className="text-muted disabled:opacity-40"
      >
        Sonraki →
      </Button>
    </Card>
  );
}
