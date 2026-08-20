// Pages Function: GET /api/weather — 気象庁の東京都予報から伊豆大島(伊豆諸島北部/伊豆諸島)の日別予報を返す
// 短期(今日〜明後日・文章天気) + 週間(7日・weatherCode) を forecast.mjs でマージし、
// 利用可能な全日付の { date, weather, pop } を返す。日付の選別はフロント側で行う。
import { buildForecast } from "./_lib/forecast.mjs";

const JMA_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json";

export async function onRequestGet(ctx) {
  // Node harness (dev:node) には caches.default が存在しないためガードする。
  // 本番の Cloudflare では Cache API が使える。
  const cache = globalThis.caches?.default;
  // レスポンス形式を変えたら CACHE_VERSION を上げて旧キャッシュを即時無効化する
  const CACHE_VERSION = "v2";
  const cu = new URL(ctx.request.url);
  cu.searchParams.set("cv", CACHE_VERSION);
  const cacheKey = new Request(cu.toString());
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let payload;
  try {
    const r = await fetch(JMA_URL, { headers: { "User-Agent": "oshima-smart-course (hackathon demo)" } });
    if (!r.ok) throw new Error(`jma ${r.status}`);
    const forecast = buildForecast(await r.json());
    if (!forecast.length) throw new Error("empty forecast");
    payload = { forecast, source: "気象庁 天気予報JSON(東京都)" };
  } catch {
    payload = { unavailable: true };
  }

  const res = new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
  if (cache && !payload.unavailable) await cache.put(cacheKey, res.clone());
  return res;
}
