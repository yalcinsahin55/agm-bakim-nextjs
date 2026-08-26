import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const sourcePath = resolve(process.cwd(), "lib/mongodb.ts");
const source = readFileSync(sourcePath, "utf8");

test("Mongo helper initializes lazily and does not cache rejected connections", () => {
  assert.match(source, /function createClientPromise\(\): Promise<MongoClient>/);
  assert.match(source, /global\._mongoClientPromise \?\? createClientPromise\(\)/);
  assert.match(source, /global\._mongoClientPromise === promise/);
  assert.match(source, /global\._mongoClientPromise = undefined/);
  assert.match(source, /void client\.close\(\)\.catch\(\(\) => undefined\)/);
});

test("Mongo helper keeps bounded serverless connection timeouts", () => {
  assert.match(source, /maxPoolSize: 10/);
  assert.match(source, /minPoolSize: 0/);
  assert.match(source, /serverSelectionTimeoutMS: 8000/);
  assert.match(source, /connectTimeoutMS: 8000/);
});
