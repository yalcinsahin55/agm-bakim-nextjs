export function isSafeMongoPathSegment(value: unknown, maxLength = 120): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[.$\0]/.test(value);
}
