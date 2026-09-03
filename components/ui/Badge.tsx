import { memo, type HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-border bg-panel2 text-muted",
  success: "border-green/30 bg-green/10 text-green",
  warning: "border-amber/30 bg-amber/10 text-amber",
  danger: "border-red/30 bg-red/10 text-red",
  info: "border-teal/30 bg-teal/10 text-teal",
};

export const Badge = memo(function Badge({ tone = "neutral", dot = false, className = "", children, ...props }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold ${TONE_CLASSES[tone]} ${className}`} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
});

Badge.displayName = "Badge";

export default Badge;
