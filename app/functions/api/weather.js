// Pages Function: GET /api/weather — 気象庁の東京都予報から伊豆諸島北部(大島)を抽出
//
// JMA JSON構造 (2026-08-20時点で実データ確認済み。130000.json):
//   data[0].timeSeries[0] … 天気 (weathers)
//     timeDefines: [今日17:00, 明日00:00, 明後日00:00] の3件
//     areas[].area.name === "伊豆諸島北部" (code 130020) に大島を含む予報
//     weathers[i] が timeDefines[i] に対応 (例: "晴れ　夜遅く　くもり")
//   data[0].timeSeries[1] … 降水確率 (pops)
//     timeDefines: 3時間〜6時間刻みで5件程度 (今日18:00, 明日00/06/12/18:00 等)
//     pops[i] が timeDefines[i] に対応。日付をまたいで複数件が同じ日付に属する。
// 「向こう2日分」= timeSeries[0].timeDefines の先頭2件 (今日・明日) を採用。
// pop は timeSeries[1] 側を日付でグルーピングし、同日内の最大値を採用
// (今日分は残り時間のみ・部分的なため、値が欠けていることがある → 存在する値の最大)。
const JMA_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json";
const AREA_NAME = "伊豆諸島北部";

function popsByDate(popSeries) {
  const map = {};
  if (!popSeries) return map;
  const area = popSeries.areas?.find((a) => a.area?.name?.includes(AREA_NAME));
  if (!area?.pops) return map;
  popSeries.timeDefines.forEach((t, i) => {
    const date = t.slice(0, 10);
    const raw = area.pops[i];
    if (raw === undefined || raw === "") return;
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    if (!(date in map) || n > map[date]) map[date] = n;
  });
  return map;
}

export async function onRequestGet(ctx) {
  // Node harness (dev:node) には caches.default が存在しないためガードする。
  // 本番の Cloudflare Pages では Cache API が使える。
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL(ctx.request.url).toString());
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let payload;
  try {
    const r = await fetch(JMA_URL, { headers: { "User-Agent": "oshima-smart-course (hackathon demo)" } });
    if (!r.ok) throw new Error(`jma ${r.status}`);
    const data = await r.json();
    const ts = data[0]?.timeSeries;
    if (!ts?.[0]) throw new Error("no timeSeries");
    const wArea = ts[0].areas.find((a) => a.area.name.includes(AREA_NAME));
    if (!wArea) throw new Error("area not found");
    const popMap = popsByDate(ts[1]);

    const forecast = ts[0].timeDefines.slice(0, 2).map((t, i) => {
      const date = t.slice(0, 10);
      return {
        date,
        weather: (wArea.weathers?.[i] ?? "").replace(/\s+/g, " ").trim(),
        pop: popMap[date] ?? null,
      };
    });
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
