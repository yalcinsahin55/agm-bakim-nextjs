export type HapticKind = "light" | "success" | "warning";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  success: [10, 18, 10],
  warning: [18, 24, 18],
};

export function triggerHaptic(kind: HapticKind = "light"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Haptics are optional and must never interrupt the interaction.
  }
}
