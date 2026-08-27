export function isSafeMongoPathSegment(value: unknown, maxLength = 120): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[.$\0]/.test(value);
}

export function isMongoDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);
}
