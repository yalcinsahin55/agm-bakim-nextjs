import { memo, type ReactNode } from "react";
import Input from "./Input";

interface SearchFilterBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  filters?: ReactNode;
  actions?: ReactNode;
}

const SearchFilterBar = memo(function SearchFilterBar({ value, onChange, placeholder = "Ara...", label = "Ara", filters, actions }: SearchFilterBarProps) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-panel p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <label className="sr-only">{label}</label>
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} />
      </div>
      {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
});

SearchFilterBar.displayName = "SearchFilterBar";
export default SearchFilterBar;
