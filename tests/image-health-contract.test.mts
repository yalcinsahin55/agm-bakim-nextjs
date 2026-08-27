import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("all previously warned image call sites use Next Image", () => {
  const files = [
    "app/kayitlar/_components/RecordEditMediaSection.tsx",
    "components/MaintenanceEvidencePreview.tsx",
    "app/motorlar/_components/EngineQrModal.tsx",
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

test("Vercel keeps the notification refresh cron after optional MongoDB probing is disabled", () => {
  const config = JSON.parse(readProjectFile("vercel.json")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  assert.deepEqual(config.crons, [
    { path: "/api/cron/refresh", schedule: "0 6 * * *" },
  ]);
});
test("maintenance media handlers always clear loading state after processing", () => {
  const completionSource = readProjectFile("app/tamamla/page.tsx");
  const completionEvidenceSource = readProjectFile("app/tamamla/_components/CompletionEvidenceSection.tsx");
  const editSource = readProjectFile("app/kayitlar/_components/MaintenanceRecordEditForm.tsx");
  const editMediaHook = readProjectFile("app/kayitlar/_hooks/useRecordEditMedia.ts");
  const compressionSource = readProjectFile("lib/imageCompression.ts");

  assert.match(completionSource, /import \{ compressImage \} from "@\/lib\/imageCompression"/);
  assert.match(completionSource, /try \{[\s\S]*setPhotos\(\(prev\) => \[\.\.\.prev, \.\.\.uploaded\]\);[\s\S]*setPhotoBusy\(false\);[\s\S]*e\.target\.value = "";[\s\S]*\} finally/);
  assert.match(completionEvidenceSource, /disabled=\{submitting \|\| photoBusy \|\| videoBusy/);
  assert.match(completionSource, /uploadMaintenanceMedia\([\s\S]*150_000/);
  assert.match(editMediaHook, /import \{ compressImage \} from "@\/lib\/imageCompression"/);
  assert.match(editMediaHook, /const \[mediaBusy, setMediaBusy\] = useState\(false\)/);
  assert.match(editMediaHook, /setMediaBusy\(true\);[\s\S]*setMediaBusy\(false\);/);
  assert.match(editSource, /disabled=\{busy \|\| mediaBusy \|\| reportAttachmentBusy\}/);
  assert.match(compressionSource, /IMAGE_PROCESSING_TIMEOUT_MS = 30_000/);
  assert.match(compressionSource, /reader\.onabort/);
  assert.match(compressionSource, /canvas\.toBlob/);
});
