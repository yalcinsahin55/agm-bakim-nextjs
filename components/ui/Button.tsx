import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-amber text-bg hover:brightness-110 focus-visible:ring-amber/50",
  secondary: "border border-border bg-panel2 text-text hover:border-borderlt focus-visible:ring-teal/50",
  ghost: "text-muted hover:bg-panel2 hover:text-text focus-visible:ring-teal/50",
  danger: "border border-red/40 bg-red/10 text-red hover:bg-red/20 focus-visible:ring-red/40",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-8 px-2.5 py-1.5 text-[10px]",
  md: "min-h-10 px-3 py-2 text-[11px]",
  lg: "min-h-11 px-4 py-2.5 text-[12px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", fullWidth = false, className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-lg font-bold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
});

Button.displayName = "Button";

export default Button;
