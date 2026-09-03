import { memo, type ReactNode } from "react";

interface PageToolbarProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

const PageToolbar = memo(function PageToolbar({ eyebrow, title, description, actions }: PageToolbarProps) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-3 border-b border-border pb-4 lg:flex-row lg:items-end">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber">{eyebrow}</div>}
        <h1 className="text-xl font-extrabold tracking-tight text-text md:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
});

PageToolbar.displayName = "PageToolbar";
export default PageToolbar;
