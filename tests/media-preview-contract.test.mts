import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("new maintenance form renders unsaved media without persisted-record proxy", () => {
  const source = readProjectFile("app/tamamla/page.tsx");
  const preview = readProjectFile("components/MaintenanceEvidencePreview.tsx");

  assert.doesNotMatch(source, /import \{ getMediaDisplayUrl \} from "@\/lib\/mediaUrls"/);
  assert.match(preview, /return photo\.startsWith\("http:\/\/"\) \|\| photo\.startsWith\("https:\/\/"\)\s*\? photo/);
  assert.match(preview, /video\.url \|\| undefined/);
});

test("edit form distinguishes transient uploads from persisted record media", () => {
  const media = readProjectFile("app/kayitlar/_lib/recordMedia.ts");
  const editHook = readProjectFile("app/kayitlar/_hooks/useRecordEditMedia.ts");
  const editMedia = readProjectFile("app/kayitlar/_components/RecordEditMediaSection.tsx");
  assert.match(media, /export function getPhotoSrc\(photo: string, previews: Record<string, string> = \{\}, transientUrls\?: ReadonlySet<string>\)/);
  assert.match(media, /return transientUrls\?\.has\(photo\) \? photo : getMediaDisplayUrl\(photo, "image"\)/);
  assert.match(media, /export function getVideoSrc\(v: VideoItem \| string, previews: Record<string, string> = \{\}, transientUrls\?: ReadonlySet<string>\)/);
  assert.match(editHook, /const \[transientPhotoUrls, setTransientPhotoUrls\] = useState<Set<string>>/);
  assert.match(editMedia, /getPhotoSrc\(photo, offlinePreviews, transientPhotoUrls\)/);
  assert.match(editHook, /setTransientPhotoUrls\(\(current\) =>/);
});
test("media proxy only serves URLs already attached to a maintenance record", () => {
  const source = readProjectFile("app/api/media/file/route.ts");

  assert.match(source, /Medya kaydı bulunamadı/);
  assert.match(source, /photos: url/);
  assert.match(source, /\$or: \[\{ videos: url \}, \{ "videos\.url": url \}\]/);
});
