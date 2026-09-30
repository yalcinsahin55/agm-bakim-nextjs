import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={`ui-card ${className}`.trim()} {...props}>{children}</div>;
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  const variantClass = {
    primary: "ui-button-primary",
    secondary: "ui-button-secondary",
    danger: "ui-button-danger",
    ghost: "border border-border text-muted hover:bg-panel2 hover:text-text",
  }[variant];
  return <button className={`ui-button ${variantClass} ${className}`.trim()} {...props}>{children}</button>;
}
