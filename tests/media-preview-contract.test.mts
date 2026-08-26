import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("new maintenance form renders unsaved media without persisted-record proxy", () => {
  const source = readProjectFile("app/tamamla/page.tsx");

  assert.doesNotMatch(source, /import \{ getMediaDisplayUrl \} from "@\/lib\/mediaUrls"/);
  assert.match(source, /return photo\.startsWith\("http:\/\/"\) \|\| photo\.startsWith\("https:\/\/"\)\s*\? photo/);
  assert.match(source, /video\.url \|\| undefined/);
});

test("edit form distinguishes transient uploads from persisted record media", () => {
  const source = readProjectFile("app/kayitlar/page.tsx");

  assert.match(source, /function getPhotoSrc\(photo: string, previews: Record<string, string> = \{\}, transientUrls\?: ReadonlySet<string>\)/);
  assert.match(source, /return transientUrls\?\.has\(photo\) \? photo : getMediaDisplayUrl\(photo, "image"\)/);
  assert.match(source, /function getVideoSrc\(v: VideoItem \| string, previews: Record<string, string> = \{\}, transientUrls\?: ReadonlySet<string>\)/);
  assert.match(source, /const \[transientPhotoUrls, setTransientPhotoUrls\] = useState<Set<string>>/);
  assert.match(source, /getPhotoSrc\(p, offlinePreviews, transientPhotoUrls\)/);
  assert.match(source, /setTransientPhotoUrls\(\(current\) =>/);
});

test("media proxy only serves URLs already attached to a maintenance record", () => {
  const source = readProjectFile("app/api/media/file/route.ts");

  assert.match(source, /Medya kaydı bulunamadı/);
  assert.match(source, /photos: url/);
  assert.match(source, /\$or: \[\{ videos: url \}, \{ "videos\.url": url \}\]/);
});
