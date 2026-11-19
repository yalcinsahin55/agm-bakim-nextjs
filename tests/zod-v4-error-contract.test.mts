import test from "node:test";
import assert from "node:assert/strict";
import { numberWithTypeError, requiredNumber, requiredString } from "../lib/zodHelpers.ts";

test("Zod 4 preserves required-string messages but leaves non-missing type errors to defaults", () => {
  const requiredMessage = "Şifre gereklidir.";
  const missing = requiredString(requiredMessage).safeParse(undefined);
  assert.equal(missing.success, false);
  if (!missing.success) assert.equal(missing.error.issues[0]?.message, requiredMessage);

  const wrongType = requiredString(requiredMessage).safeParse(123);
  assert.equal(wrongType.success, false);
  if (!wrongType.success) assert.notEqual(wrongType.error.issues[0]?.message, requiredMessage);

  assert.equal(requiredString(requiredMessage).safeParse("parola1").success, true);
});

test("Zod 4 preserves required-number and custom invalid-type messages", () => {
  const requiredMessage = "Motor çalışma saati gereklidir.";
  const invalidTypeMessage = "Motor saati bir sayı olmalıdır.";
  const schema = requiredNumber(requiredMessage, invalidTypeMessage);

  const missing = schema.safeParse(undefined);
  assert.equal(missing.success, false);
  if (!missing.success) assert.equal(missing.error.issues[0]?.message, requiredMessage);

  const wrongType = schema.safeParse("1000");
  assert.equal(wrongType.success, false);
  if (!wrongType.success) assert.equal(wrongType.error.issues[0]?.message, invalidTypeMessage);

  assert.equal(schema.safeParse(1000).success, true);
});

test("Zod 4 preserves optional-number invalid-type messages", () => {
  const message = "Basınç bir sayı olmalıdır.";
  const schema = numberWithTypeError(message).optional();

  assert.equal(schema.safeParse(undefined).success, true);
  const wrongType = schema.safeParse("12");
  assert.equal(wrongType.success, false);
  if (!wrongType.success) assert.equal(wrongType.error.issues[0]?.message, message);
});
