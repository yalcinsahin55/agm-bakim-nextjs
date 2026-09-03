import { memo, type ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export const EmptyState = memo(function EmptyState({ title, description, icon, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`rounded-card border border-border bg-panel px-4 py-10 text-center ${className}`}>
      {icon && <div className="mb-3 text-3xl" aria-hidden="true">{icon}</div>}
      <h2 className="text-sm font-bold text-text">{title}</h2>
      {description && <p className="mx-auto mt-1 max-w-md text-xs text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
});

EmptyState.displayName = "EmptyState";

export default EmptyState;
