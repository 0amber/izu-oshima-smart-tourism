import test from "node:test";
import assert from "node:assert/strict";
import { buildForecast } from "../functions/api/_lib/forecast.mjs";

// 気象庁 130000.json の構造を模した最小フィクスチャ
const jma = [
  { // 短期(今日〜明後日)
    timeSeries: [
      {
        timeDefines: ["2026-08-21T17:00:00+09:00", "2026-08-22T00:00:00+09:00"],
        areas: [
          { area: { name: "東京地方" }, weathers: ["くもり", "くもり"] },
          { area: { name: "伊豆諸島北部" }, weathers: ["晴れ　夜遅く　くもり", "くもり　時々　晴れ"] },
        ],
      },
      {
        timeDefines: ["2026-08-21T18:00:00+09:00", "2026-08-22T00:00:00+09:00", "2026-08-22T06:00:00+09:00"],
        areas: [
          { area: { name: "東京地方" }, pops: ["10", "20", "30"] },
          { area: { name: "伊豆諸島北部" }, pops: ["10", "20", "40"] },
        ],
      },
    ],
  },
  { // 週間(7日)
    timeSeries: [
      {
        timeDefines: ["2026-08-21T00:00:00+09:00", "2026-08-22T00:00:00+09:00", "2026-08-23T00:00:00+09:00", "2026-08-24T00:00:00+09:00"],
        areas: [
          { area: { name: "東京地方" }, weatherCodes: ["200", "200", "200", "200"], pops: ["", "40", "50", "60"] },
          { area: { name: "伊豆諸島" }, weatherCodes: ["201", "202", "300", "101"], pops: ["", "30", "70", "20"] },
        ],
      },
    ],
  },
];

test("buildForecast: 短期の文章天気が週間コードより優先される", () => {
  const f = buildForecast(jma);
  const d21 = f.find((x) => x.date === "2026-08-21");
  assert.equal(d21.weather, "晴れ 夜遅く くもり"); // 短期の文章
  assert.equal(d21.pop, 10);
});

test("buildForecast: 週間だけの日はコード変換の天気とpopが入る", () => {
  const f = buildForecast(jma);
  const d23 = f.find((x) => x.date === "2026-08-23");
  assert.equal(d23.weather, "雨"); // code 300
  assert.equal(d23.pop, 70);
  const d24 = f.find((x) => x.date === "2026-08-24");
  assert.equal(d24.weather, "晴れ時々くもり"); // code 101
});

test("buildForecast: 日付昇順で範囲全体をカバーする", () => {
  const f = buildForecast(jma);
  assert.deepEqual(f.map((x) => x.date), ["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"]);
});
