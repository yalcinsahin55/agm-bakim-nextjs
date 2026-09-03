import { memo, type ReactNode } from "react";
import Card from "./Card";

interface StatCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning";
}

const VALUE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "text-text",
  accent: "text-amber",
  success: "text-green",
  warning: "text-yellow",
};

const StatCard = memo(function StatCard({ label, value, detail, tone = "neutral" }: StatCardProps) {
  return (
    <Card className="min-w-0 p-3">
      <div className="text-[9px] font-bold uppercase tracking-wide text-faint">{label}</div>
      <div className={`mt-1 break-words font-mono text-xl font-bold ${VALUE_CLASSES[tone]}`}>{value}</div>
      {detail && <div className="mt-1 text-[10px] text-muted">{detail}</div>}
    </Card>
  );
});

StatCard.displayName = "StatCard";
export default StatCard;
