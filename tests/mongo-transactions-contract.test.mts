import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helperPath = new URL("../lib/mongoTransactions.ts", import.meta.url);
const recordCreatePath = new URL("../app/api/records/_lib/recordCreate.ts", import.meta.url);

test("grouped maintenance transactions are required in production and fallback is explicit outside production", async () => {
  const [helper, recordCreate] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(recordCreatePath, "utf8"),
  ]);
  assert.match(helper, /db\.command\(\{ hello: 1 \}\)/);
  assert.match(helper, /process\.env\.VERCEL_ENV \|\| process\.env\.NODE_ENV/);
  assert.match(recordCreate, /supportsMongoTransactions\(db\)/);
  assert.match(recordCreate, /!transactionSupported && requiresMongoTransactions\(\)/);
  assert.match(recordCreate, /if \(session\) \{[\s\S]*?withTransaction\(groupedWrite\)/);
  assert.match(recordCreate, /else \{[\s\S]*?await groupedWrite\(\)/);
});
