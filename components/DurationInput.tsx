"use client";

import { useEffect, useState } from "react";
import { durationPartsToMinutes, splitDurationMinutes } from "@/lib/maintenanceTime";

interface DurationInputProps {
  valueMinutes: number | null | undefined;
  onChange: (minutes: number | null) => void;
  maxMinutes?: number;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

export default function DurationInput({
  valueMinutes,
  onChange,
  maxMinutes = 366 * 24 * 60,
  required = false,
  disabled = false,
  label = "Çalışma süresi",
  compact = false,
}: DurationInputProps) {
  const [parts, setParts] = useState(() => splitDurationMinutes(valueMinutes));

  useEffect(() => {
    const localValue = durationPartsToMinutes(parts.hours, parts.minutes, maxMinutes);
    if (localValue !== valueMinutes) setParts(splitDurationMinutes(valueMinutes));
  }, [maxMinutes, parts.hours, parts.minutes, valueMinutes]);

  function changePart(part: "hours" | "minutes", value: string): void {
    const next = { ...parts, [part]: value };
    setParts(next);
    onChange(durationPartsToMinutes(next.hours, next.minutes, maxMinutes));
  }

  const maxHours = Math.floor(maxMinutes / 60);
  const selectedHours = Number(parts.hours);
  const maxMinutesForSelectedHour = Number.isInteger(selectedHours) && selectedHours === maxHours ? maxMinutes % 60 : 59;
  const inputClass = compact
    ? "w-14 rounded-md border border-border bg-panel px-1.5 py-1 text-right font-mono text-[10.5px] text-text outline-none focus:border-amber"
    : "w-20 rounded-lg border border-border bg-panel px-2 py-2 text-right font-mono text-[12px] text-text outline-none focus:border-amber";
  const textClass = compact ? "text-[9px]" : "text-[10px]";

  return (
    <span className="inline-flex min-w-0 flex-col gap-1">
      <span className={`${textClass} text-muted`}>{label}</span>
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min="0"
          max={maxHours}
          step="1"
          inputMode="numeric"
          value={parts.hours}
          onChange={(event) => changePart("hours", event.target.value)}
          className={inputClass}
          aria-label={`${label} saat`}
          required={required}
          disabled={disabled}
        />
        <span className={`${textClass} text-faint`}>sa</span>
        <input
          type="number"
          min="0"
          max={maxMinutesForSelectedHour}
          step="1"
          inputMode="numeric"
          value={parts.minutes}
          onChange={(event) => changePart("minutes", event.target.value)}
          className={inputClass}
          aria-label={`${label} dakika`}
          required={required}
          disabled={disabled}
        />
        <span className={`${textClass} text-faint`}>dk</span>
      </span>
    </span>
  );
}
