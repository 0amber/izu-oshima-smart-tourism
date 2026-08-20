// forecast.mjs — 気象庁 130000.json から伊豆大島向けの日別予報リストを組み立てる純粋関数。
// data[0](短期: 今日〜明後日, 文章の天気) と data[1](週間: 7日, weatherCode+降水確率) をマージし、
// 日付昇順の { date, weather, pop } 配列を返す。短期の文章表現を優先する。
const SHORT_AREA = "伊豆諸島北部"; // 大島を含む短期予報エリア
const WEEK_AREA = "伊豆諸島";      // 週間予報のエリア(北部/南部の区別なし)

// 気象庁 weatherCode → 簡易表現。主要コードのみ辞書、それ以外は百の位で大分類。
const CODE_TEXT = {
  100: "晴れ", 101: "晴れ時々くもり", 102: "晴れ一時雨", 110: "晴れのちくもり", 111: "晴れのちくもり", 112: "晴れのち雨",
  200: "くもり", 201: "くもり時々晴れ", 202: "くもり一時雨", 203: "くもり時々雨", 206: "くもり一時雨", 207: "くもり時々雨",
  210: "くもりのち晴れ", 211: "くもりのち晴れ", 212: "くもりのち雨", 213: "くもりのち雨",
  300: "雨", 301: "雨時々晴れ", 302: "雨時々やむ", 303: "雨時々雪", 308: "大雨・暴風", 311: "雨のち晴れ", 313: "雨のちくもり",
  400: "雪",
};
function codeToText(code) {
  const n = Number(code);
  if (CODE_TEXT[n]) return CODE_TEXT[n];
  return ["", "晴れ", "くもり", "雨", "雪"][Math.floor(n / 100)] || "";
}

function popsByDate(popSeries, areaName) {
  const map = {};
  if (!popSeries) return map;
  const area = popSeries.areas?.find((a) => a.area?.name?.includes(areaName));
  if (!area?.pops) return map;
  popSeries.timeDefines.forEach((t, i) => {
    const date = t.slice(0, 10);
    const n = Number(area.pops[i]);
    if (area.pops[i] === "" || Number.isNaN(n)) return;
    if (!(date in map) || n > map[date]) map[date] = n;
  });
  return map;
}

/** data = 130000.json の配列全体。戻り値: [{date, weather, pop}] (日付昇順・重複なし) */
export function buildForecast(data) {
  const byDate = {};

  // 週間予報(先に入れて、短期で上書きする)
  const week = data[1]?.timeSeries?.[0];
  const weekArea = week?.areas?.find((a) => a.area?.name === WEEK_AREA);
  if (week && weekArea) {
    week.timeDefines.forEach((t, i) => {
      const date = t.slice(0, 10);
      const w = codeToText(weekArea.weatherCodes?.[i] ?? "");
      const pop = Number(weekArea.pops?.[i]);
      byDate[date] = { date, weather: w, pop: Number.isNaN(pop) || weekArea.pops?.[i] === "" ? null : pop };
    });
  }

  // 短期予報(文章の天気・時間帯別降水確率)で上書き
  const ts = data[0]?.timeSeries;
  const shortArea = ts?.[0]?.areas?.find((a) => a.area?.name?.includes(SHORT_AREA));
  if (ts?.[0] && shortArea) {
    const popMap = popsByDate(ts[1], SHORT_AREA);
    ts[0].timeDefines.forEach((t, i) => {
      const date = t.slice(0, 10);
      const weather = (shortArea.weathers?.[i] ?? "").replace(/\s+/g, " ").trim();
      if (!weather) return;
      byDate[date] = { date, weather, pop: popMap[date] ?? byDate[date]?.pop ?? null };
    });
  }

  return Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1));
}
