export type QuickMaintenanceLinkOptions = {
  engineId?: string;
  typeKey?: string;
  origin?: string;
};

/**
 * Builds the stable, camera-independent URL encoded in printed QR labels.
 * Only the engine/type selectors are accepted; all values are URL encoded.
 */
export function buildQuickMaintenanceLink({ engineId, typeKey, origin = "" }: QuickMaintenanceLinkOptions): string {
  const params = new URLSearchParams();
  if (engineId?.trim()) params.set("engine_id", engineId.trim());
  if (typeKey?.trim()) params.set("type_key", typeKey.trim());
  params.set("mode", "quick");
  params.set("plant_id", "avcikoru");
  return `${origin}/tamamla?${params.toString()}`;
}
