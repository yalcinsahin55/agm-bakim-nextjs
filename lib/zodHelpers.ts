import { z } from "zod";

export function requiredString(message: string) {
  return z.string({
    error: (issue) => issue.input === undefined ? message : undefined,
  });
}

export function requiredNumber(requiredMessage: string, invalidTypeMessage: string) {
  return z.number({
    error: (issue) => issue.input === undefined ? requiredMessage : invalidTypeMessage,
  });
}

export function numberWithTypeError(invalidTypeMessage: string) {
  return z.number({ error: invalidTypeMessage });
}
