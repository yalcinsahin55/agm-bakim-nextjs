import type { Db } from "mongodb";

export async function supportsMongoTransactions(db: Db): Promise<boolean> {
  try {
    const hello = await db.command({ hello: 1 });
    return typeof hello.setName === "string" || hello.msg === "isdbgrid";
  } catch {
    return false;
  }
}

export function requiresMongoTransactions(): boolean {
  return (process.env.VERCEL_ENV || process.env.NODE_ENV) === "production";
}
