import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error = false, className = "", ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`min-h-10 w-full rounded-lg border bg-panel2 px-3 py-2 text-sm text-text outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${error ? "border-red focus:border-red focus:ring-red/20" : "border-border focus:border-teal focus:ring-teal/20"} ${className}`}
      {...props}
    />
  );
});

Select.displayName = "Select";

export default Select;
