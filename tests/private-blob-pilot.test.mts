import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrivateBlobPilotPath,
  getPrivateBlobPilotStoreId,
  isPrivateBlobPilotEnabled,
  isPrivateBlobPilotFolder,
  isPrivateBlobUrl,
  shouldUsePrivateBlobPilot,
} from "../lib/privateBlobPilot.ts";

test("private Blob pilot is opt-in and preview-only", () => {
  assert.equal(isPrivateBlobPilotEnabled({ PRIVATE_BLOB_PILOT_ENABLED: "true", VERCEL_ENV: "preview" }), true);
  assert.equal(isPrivateBlobPilotEnabled({ PRIVATE_BLOB_PILOT_ENABLED: "true", VERCEL_ENV: "production" }), false);
  assert.equal(isPrivateBlobPilotEnabled({ PRIVATE_BLOB_PILOT_ENABLED: "true", VERCEL_ENV: "development" }), false);
  assert.equal(isPrivateBlobPilotEnabled({ PRIVATE_BLOB_PILOT_ENABLED: "false", VERCEL_ENV: "preview" }), false);
});

test("private Blob pilot allowlists only sensitive report folders", () => {
  const preview = { PRIVATE_BLOB_PILOT_ENABLED: "true", VERCEL_ENV: "preview" };
  assert.equal(isPrivateBlobPilotFolder("report-attachments"), true);
  assert.equal(isPrivateBlobPilotFolder("oil-analyses"), true);
  assert.equal(isPrivateBlobPilotFolder("photos"), false);
  assert.equal(isPrivateBlobPilotFolder("videos"), false);
  assert.equal(shouldUsePrivateBlobPilot("report-attachments", preview), true);
  assert.equal(shouldUsePrivateBlobPilot("oil-analyses", preview), true);
  assert.equal(shouldUsePrivateBlobPilot("photos", preview), false);
  assert.equal(shouldUsePrivateBlobPilot("report-attachments", { ...preview, VERCEL_ENV: "production" }), false);
});

test("private pilot paths are namespaced without changing the original filename", () => {
  assert.equal(
    buildPrivateBlobPilotPath("report-attachments", "2026-08-27-report.pdf"),
    "private-pilot/report-attachments/2026-08-27-report.pdf",
  );
});

test("private pilot uses the connected media store ID and recognizes private Blob URLs", () => {
  assert.equal(getPrivateBlobPilotStoreId({ MEDIA_STORE_ID: "  store_media " }), "store_media");
  assert.equal(getPrivateBlobPilotStoreId({ PRIVATE_BLOB_STORE_ID: "store_private", MEDIA_STORE_ID: "store_media" }), "store_private");
  assert.equal(getPrivateBlobPilotStoreId({ MEDIA_STORE_ID: "   " }), undefined);
  assert.equal(isPrivateBlobUrl("https://example.private.blob.vercel-storage.com/private-pilot/report.pdf"), true);
  assert.equal(isPrivateBlobUrl("https://example.public.blob.vercel-storage.com/report.pdf"), false);
  assert.equal(isPrivateBlobUrl("not-a-url"), false);
});
