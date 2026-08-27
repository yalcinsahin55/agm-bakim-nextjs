export function isSafeMongoPathSegment(value: unknown, maxLength = 120): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[.$\0]/.test(value);
}

function hasDuplicateKeyCode(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "code" in value && (value as { code?: unknown }).code === 11000);
}

export function isMongoDuplicateKeyError(error: unknown): boolean {
  if (hasDuplicateKeyCode(error)) return true;
  if (!error || typeof error !== "object" || !("writeErrors" in error)) return false;
  const writeErrors = (error as { writeErrors?: unknown }).writeErrors;
  return Array.isArray(writeErrors) && writeErrors.some(hasDuplicateKeyCode);
}
