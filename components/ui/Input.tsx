import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error = false, className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`min-h-10 w-full rounded-lg border bg-panel2 px-3 py-2 text-sm text-text outline-none transition placeholder:text-faint focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${error ? "border-red focus:border-red focus:ring-red/20" : "border-border focus:border-teal focus:ring-teal/20"} ${className}`}
      {...props}
    />
  );
});

Input.displayName = "Input";

export default Input;
