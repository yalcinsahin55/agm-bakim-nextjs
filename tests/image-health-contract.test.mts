import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("all previously warned image call sites use Next Image", () => {
  const files = [
    "app/kayitlar/page.tsx",
    "app/tamamla/page.tsx",
    "app/motorlar/page.tsx",
    "app/qr-etiketleri/page.tsx",
    "components/Lightbox.tsx",
  ];

  for (const file of files) {
    const source = readProjectFile(file);
    assert.match(source, /from "next\/image"/);
    assert.doesNotMatch(source, /<img\b/);
  }

  assert.match(readProjectFile("components/Lightbox.tsx"), /sizes="\(max-width: 768px\) 92vw, 85vw"/);
  assert.match(readProjectFile("app/qr-etiketleri/page.tsx"), /width=\{170\} height=\{170\}/);
});

test("MongoDB health endpoint is secret-protected and performs a bounded ping", () => {
  const source = readProjectFile("app/api/health/mongodb/route.ts");
  assert.match(source, /process\.env\.CRON_SECRET/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /status: 401/);
  assert.match(source, /db\.command\(\{ ping: 1 \}\)/);
  assert.match(source, /status: 503/);
  assert.match(source, /maxDuration = 10/);
  assert.doesNotMatch(source, /error: error/);
  assert.doesNotMatch(source, /stack/);
});

test("Vercel keeps notification refresh and adds a daily MongoDB health probe", () => {
  const config = JSON.parse(readProjectFile("vercel.json")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  assert.deepEqual(config.crons, [
    { path: "/api/cron/refresh", schedule: "0 6 * * *" },
    { path: "/api/health/mongodb", schedule: "0 7 * * *" },
  ]);
});
