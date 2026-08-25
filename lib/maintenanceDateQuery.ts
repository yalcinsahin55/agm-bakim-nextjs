/**
 * Bakım tarihleri yeni kayıtlarda Date, eski kayıtlarda ISO string olabilir.
 * Bu ön-match yalnızca kesinlikle dışarıda kalan modern Date değerlerini eler;
 * legacy string/number değerleri final `$convert` aşamasına bırakır.
 */
export function maintenanceDateCandidateMatch(from?: Date, to?: Date): Record<string, unknown> | null {
  if (!from && !to) return null;
  const range = {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
  return {
    $or: [
      { maintenance_start_at: range },
      { maintenance_start_at: { $type: "string" } },
      { maintenance_start_at: { $type: "number" } },
      {
        $and: [
          { $or: [{ maintenance_start_at: { $exists: false } }, { maintenance_start_at: null }] },
          { created_at: range },
        ],
      },
    ],
  };
}
