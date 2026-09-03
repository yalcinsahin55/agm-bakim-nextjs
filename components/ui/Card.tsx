import { forwardRef, type HTMLAttributes } from "react";

export type CardTone = "default" | "muted" | "accent";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

const TONE_CLASSES: Record<CardTone, string> = {
  default: "border-border bg-panel",
  muted: "border-border/80 bg-panel2",
  accent: "border-amber/30 bg-panel",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = "default", className = "", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`rounded-card border p-3.5 ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    />
  );
});

Card.displayName = "Card";

export default Card;
