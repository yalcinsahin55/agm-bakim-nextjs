import { STATUS_LABELS } from "@/lib/status";

export default function StatusPill({ status }) {
  return (
    <span className={`status-pill ${status}`}>
      <span className="dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}
