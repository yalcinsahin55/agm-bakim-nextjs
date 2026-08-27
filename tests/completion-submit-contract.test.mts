import test from "node:test";
import assert from "node:assert/strict";
import { submitCompletion } from "../app/tamamla/_lib/completionSubmit.ts";

const payload = { client_request_id: "request-1", engine_id: "engine-1" };

function media() {
  return [{
    id: "photo-1",
    kind: "photo" as const,
    name: "photo.jpg",
    type: "image/jpeg",
    blob: new Blob(["photo"], { type: "image/jpeg" }),
  }];
}

test("submit orchestration queues offline work without calling the API", async () => {
  const queued: Array<{ payload: Record<string, unknown>; mediaCount: number }> = [];
  const result = await submitCompletion({
    payload,
    offlineMedia: media(),
    isOnline: false,
    ownerUserId: "user-1",
    queue: async (queuedPayload, queuedMedia, options) => {
      assert.equal(options.ownerUserId, "user-1");
      queued.push({ payload: queuedPayload, mediaCount: queuedMedia.length });
      return "queue-1";
    },
    post: async () => {
      throw new Error("API should not be called for offline work");
    },
  });

  assert.deepEqual(result, { kind: "queued", shouldSync: false });
  assert.deepEqual(queued, [{ payload, mediaCount: 1 }]);
});

test("submit orchestration queues online work when offline media still needs upload", async () => {
  let postCalled = false;
  let queueCalled = false;
  const result = await submitCompletion({
    payload,
    offlineMedia: media(),
    isOnline: true,
    ownerUserId: "user-2",
    queue: async (_payload, _media, options) => {
      assert.equal(options.ownerUserId, "user-2");
      queueCalled = true;
      return "queue-2";
    },
    post: async () => {
      postCalled = true;
      return new Response();
    },
  });

  assert.deepEqual(result, { kind: "queued", shouldSync: true });
  assert.equal(queueCalled, true);
  assert.equal(postCalled, false);
});

test("submit orchestration returns API success data without UI side effects", async () => {
  const result = await submitCompletion({
    payload,
    offlineMedia: [],
    isOnline: true,
    ownerUserId: "user-3",
    queue: async () => "queue-3",
    post: async (postedPayload) => {
      assert.deepEqual(postedPayload, payload);
      return new Response(JSON.stringify({ completed: ["9000"], confirmed: true }), { status: 200 });
    },
  });

  assert.deepEqual(result, { kind: "submitted", data: { completed: ["9000"], confirmed: true } });
});

test("submit orchestration returns bounded API errors for rejected requests", async () => {
  const result = await submitCompletion({
    payload,
    offlineMedia: [],
    isOnline: true,
    ownerUserId: "user-4",
    queue: async () => "queue-4",
    post: async () => new Response(JSON.stringify({ error: "Kayıt reddedildi." }), { status: 400 }),
  });

  assert.deepEqual(result, { kind: "rejected", error: "Kayıt reddedildi." });
});
