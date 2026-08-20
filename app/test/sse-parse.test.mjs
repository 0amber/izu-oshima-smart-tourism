import test from "node:test";
import assert from "node:assert/strict";
import { streamExplain } from "../public/js/app.js";

// Builds a fetch Response backed by a ReadableStream that emits the given
// UTF-8 chunks one at a time, mimicking the SSE bytes the real /api/explain
// endpoint writes (see functions/api/explain.js).
function fakeResponse(chunks, { ok = true, status = 200 } = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return { ok, status, body: stream };
}

function withFetch(fn, response) {
  const original = global.fetch;
  global.fetch = async () => response;
  return fn().finally(() => { global.fetch = original; });
}

test("streamExplain: collects two data chunks then stops at event: done", async () => {
  const chunks = [
    `data: ${JSON.stringify("こんにちは、")}\n\n`,
    `data: ${JSON.stringify("伊豆大島へようこそ。")}\n\n`,
    `event: done\ndata: {}\n\n`,
  ];
  const got = [];
  await withFetch(
    () => streamExplain({ input: {} }, null, (t) => got.push(t)),
    fakeResponse(chunks)
  );
  assert.equal(got.join(""), "こんにちは、伊豆大島へようこそ。");
});

test("streamExplain: event: fallback throws", async () => {
  const chunks = [`event: fallback\ndata: "refusal"\n\n`, `event: done\ndata: {}\n\n`];
  await assert.rejects(
    () => withFetch(() => streamExplain({ input: {} }, null, () => {}), fakeResponse(chunks)),
    /server fallback/
  );
});

test("streamExplain: empty stream throws", async () => {
  await assert.rejects(
    () => withFetch(() => streamExplain({ input: {} }, null, () => {}), fakeResponse([])),
    /empty stream/
  );
});

test("streamExplain: non-ok response throws", async () => {
  await assert.rejects(
    () => withFetch(() => streamExplain({ input: {} }, null, () => {}), fakeResponse([], { ok: false, status: 500 })),
    /explain http 500/
  );
});
