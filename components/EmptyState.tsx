import type { ReactNode } from "react";
import AppIcon, { type AppIconName } from "@/components/ui/AppIcon";

interface EmptyStateProps {
  icon?: AppIconName;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon = "records", title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-panel px-5 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber/25 bg-amber/10 text-amber">
        <AppIcon name={icon} size={22} />
      </div>
      <div className="text-sm font-extrabold text-text">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
