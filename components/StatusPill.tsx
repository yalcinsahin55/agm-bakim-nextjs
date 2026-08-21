import { STATUS_LABELS, type StatusKey } from "@/lib/status";

interface StatusPillProps {
  status: StatusKey;
}

export default function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`status-pill ${status}`}>
      <span className="dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}
