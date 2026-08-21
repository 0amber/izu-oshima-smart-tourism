import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_PROMPT, buildExplainPrompt, fallbackExplain } from "../functions/api/_lib/prompt.mjs";

const itinerary = { days: [{ label: "1日目", items: [{ type: "bus", tripId: "MIHARA_UP_1020", dep: "10:20", arr: "10:28" }] }], warnings: [], fareTotal: 1090 };

test("SYSTEM_PROMPT: 時刻を発明しないルールと4見出し構成を含む", () => {
  assert.ok(SYSTEM_PROMPT.includes("旅程JSONに書かれているものだけ"));
  for (const h of ["この旅程のポイント", "荷物についての注意", "雨天時の代替案", "ひとこと観光ガイド"]) assert.ok(SYSTEM_PROMPT.includes(h), h);
});
test("SYSTEM_PROMPT: 明るいバスガイド口調と音声読み上げ配慮を含む", () => {
  assert.ok(SYSTEM_PROMPT.includes("バスガイド"));
  assert.ok(SYSTEM_PROMPT.includes("読み上げ"));
});
test("buildExplainPrompt: 旅程と条件と天気を埋め込む", () => {
  const p = buildExplainPrompt({ itinerary, conditions: { hasLuggage: true, port: "motomachi" }, weather: { forecast: [{ date: "2026-08-22", weather: "晴れ" }] } });
  assert.ok(p.includes("MIHARA_UP_1020"));
  assert.ok(p.includes("hasLuggage"));
  assert.ok(p.includes("晴れ"));
});
test("buildExplainPrompt: 天気なしでも動く", () => {
  const p = buildExplainPrompt({ itinerary, conditions: { hasLuggage: false, port: "okada" }, weather: null });
  assert.ok(p.includes("okada"));
});
test("buildExplainPrompt: lang=en なら英語で書く指示と英語見出しが入る", () => {
  const p = buildExplainPrompt({ itinerary, conditions: { hasLuggage: true, port: "motomachi", lang: "en" }, weather: null });
  assert.ok(p.includes("entirely in English"));
  assert.ok(p.includes("Highlights of this itinerary"));
});
test("buildExplainPrompt: lang未指定なら英語指示は入らない", () => {
  const p = buildExplainPrompt({ itinerary, conditions: { hasLuggage: true, port: "motomachi" }, weather: null });
  assert.ok(!p.includes("English"));
});
test("fallbackExplain: 荷物有無で文面が変わる", () => {
  assert.notEqual(fallbackExplain({ hasLuggage: true, port: "motomachi" }), fallbackExplain({ hasLuggage: false, port: "motomachi" }));
});
