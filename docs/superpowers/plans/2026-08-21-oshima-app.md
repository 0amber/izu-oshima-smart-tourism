# 伊豆大島スマートモデルコース 公開アプリ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存PoCの旅程プランナーを Cloudflare Pages + Functions + Tailwind + Claude API の公開アプリ `app/` に昇格させ、2026-08-23 17:00 までにデプロイする。

**Architecture:** 静的フロント(vanilla JS + Tailwind)がブラウザ内で確定的に旅程を生成し、Pages Functions 2本(`/api/explain` = Claude解説SSE、`/api/weather` = 気象庁プロキシ)が装飾を担う。AI・天気が落ちても旅程は必ず出る。

**Tech Stack:** Cloudflare Pages / Pages Functions, Tailwind CSS v4 (`@tailwindcss/cli`), `@anthropic-ai/sdk` (model: `claude-opus-5`), `node --test`, Python3 (ビルドスクリプト)

**Spec:** `docs/superpowers/specs/2026-08-21-oshima-app-design.md`

## Global Constraints

- 締切: 2026-08-23 17:00。各タスク完了ごとにコミットし、動く状態を維持する
- `poc/` は変更しない(提出書類・動画から参照済み)。`app/` へはコピーして発展させる
- 時刻・運賃・便名の情報源は `data/timetable.json` のみ。LLMに時刻を発明させない
- APIキーは `wrangler secret` / `.dev.vars` のみ。リポジトリにコミットしない(公開リポジトリ)
- GTFS zip はコミットしない(ODPTライセンス)
- 生の色コードをHTMLに書かない。Tailwindトークン(`@theme`)経由のみ
- ブランチ `feature/oshima-app`(main から分岐)で作業し、PRで main へ

---

### Task 0: ブランチ整備

**Files:** なし(git操作のみ)

- [ ] **Step 1: feature/ai-readable-knowledge を main にマージ**

```bash
git checkout main
git merge feature/ai-readable-knowledge --no-edit
git push origin main
```

- [ ] **Step 2: 作業ブランチ作成**

```bash
git checkout -b feature/oshima-app
git push -u origin feature/oshima-app
```

---

### Task 1: app/ スキャフォールド + planner移植(テスト緑)

**Files:**
- Create: `app/package.json`, `app/wrangler.toml`, `app/.gitignore`
- Create(copy): `app/public/js/planner.js`, `app/public/data/timetable.json`, `app/public/data/spots.json`, `app/test/planner.test.mjs`, `app/scripts/build_gtfs.py`

**Interfaces:**
- Produces: `planner.js` の既存エクスポート `toMin, fromMin, addMin, nextBus, fare, planTrip, explain`(シグネチャ変更なし)。後続タスクはこれを import する

- [ ] **Step 1: ファイルコピー**

```bash
mkdir -p app/public/js app/public/data app/public/css app/test app/scripts app/functions/api/_lib app/src
cp poc/public/js/planner.js app/public/js/
cp poc/public/data/timetable.json poc/public/data/spots.json app/public/data/
cp poc/test/planner.test.mjs app/test/
cp poc/scripts/build_gtfs.py app/scripts/
```

- [ ] **Step 2: app/package.json を作成**

```json
{
  "name": "oshima-smart-course-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "GTFS×生成AI 伊豆大島スマートモデルコース(東京都知事杯ODH2026)",
  "scripts": {
    "test": "node --test test/",
    "dev": "wrangler pages dev public",
    "build:css": "tailwindcss -i src/styles.css -o public/css/styles.css --minify",
    "watch:css": "tailwindcss -i src/styles.css -o public/css/styles.css --watch",
    "build:standalone": "python3 scripts/build_standalone.py",
    "build:gtfs": "python3 scripts/build_gtfs.py"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest"
  },
  "devDependencies": {
    "@tailwindcss/cli": "^4",
    "wrangler": "^4"
  }
}
```

- [ ] **Step 3: app/wrangler.toml を作成**

```toml
name = "oshima-smart-course"
compatibility_date = "2026-08-01"
pages_build_output_dir = "public"
```

- [ ] **Step 4: app/.gitignore を作成**

```
node_modules/
.dev.vars
.wrangler/
dist/
```

- [ ] **Step 5: 依存インストールとテスト実行**

```bash
cd app && npm install && npm test
```

Expected: PASS(poc の 9 テストがそのまま通る。パスは相対なのでコピーだけで動く)

- [ ] **Step 6: Commit**

```bash
git add app && git commit -m "feat(app): scaffold from poc — planner + data + tests"
```

---

### Task 2: Tailwind ビルドパイプライン

**Files:**
- Create: `app/src/styles.css`
- Generate: `app/public/css/styles.css`

**Interfaces:**
- Produces: Tailwindトークン `tsubaki` `sea` `sand` `warn`(例 `bg-tsubaki`, `text-sea`, `bg-sand`, `border-warn`)。Task 3 のHTMLが使用

- [ ] **Step 1: app/src/styles.css を作成**

```css
@import "tailwindcss";

@theme {
  --color-tsubaki: #c0392b;
  --color-sea: #1a6b8a;
  --color-sand: #faf7f2;
  --color-warn: #b7791f;
  --font-body: "Hiragino Sans", "Noto Sans JP", sans-serif;
}

body { font-family: var(--font-body); }
```

- [ ] **Step 2: ビルド実行と生成物確認**

```bash
cd app && npm run build:css && head -5 public/css/styles.css && grep -c tsubaki public/css/styles.css
```

Expected: `public/css/styles.css` が生成され、grep が 1 以上(この時点ではHTMLが無いので変数定義のみヒットでも可)

- [ ] **Step 3: Commit**

```bash
git add app/src app/public/css && git commit -m "feat(app): tailwind v4 build pipeline with island theme tokens"
```

---

### Task 3: UI再構築(index.html + app.js、Tailwind)

**Files:**
- Create: `app/public/index.html`
- Create: `app/public/js/app.js`(pocベース+クラス差し替え)

**Interfaces:**
- Consumes: `planner.js` の `planTrip, nextBus, explain`
- Produces: DOM要素ID `#port #arrival #lugOn #lugOff #dayTabs #warnings #timeline #fare #dataSource #explainBtn #explainText #weatherChips #modal #modalBody #modalClose`(Task 7, 8 が参照)

- [ ] **Step 1: app/public/index.html を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>大島スマートコース</title>
<link rel="stylesheet" href="css/styles.css">
</head>
<body class="bg-sand text-neutral-800">
<header class="bg-sea text-white">
  <div class="max-w-2xl mx-auto px-4 py-4">
    <div class="text-lg font-bold">🏝️ 大島スマートコース</div>
    <div class="text-sm opacity-90">オープンデータ × 生成AI で、荷物にやさしい1泊2日</div>
    <div id="weatherChips" class="flex gap-2 mt-2 flex-wrap"></div>
  </div>
</header>

<main class="max-w-2xl mx-auto px-4 pb-16">
  <div id="staleBanner" class="hidden mt-4 rounded-xl bg-warn/10 border border-warn text-warn px-4 py-2 text-sm"></div>

  <section class="mt-4 bg-white rounded-2xl shadow-sm p-4">
    <h2 class="font-bold text-sea">1. あなたの条件</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      <label class="block">
        <span class="text-sm text-neutral-500">到着する港</span>
        <select id="port" class="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 bg-white">
          <option value="motomachi">元町港</option>
          <option value="okada">岡田港</option>
          <option value="unknown">まだわからない(当日決定)</option>
        </select>
      </label>
      <label class="block">
        <span class="text-sm text-neutral-500">到着時刻(東海汽船)</span>
        <select id="arrival" class="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 bg-white"></select>
      </label>
      <div class="block">
        <span class="text-sm text-neutral-500">荷物</span>
        <div class="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="荷物">
          <button type="button" id="lugOn" class="tbtn rounded-xl border px-3 py-2 text-sm">🧳 キャリーケースあり</button>
          <button type="button" id="lugOff" class="tbtn rounded-xl border px-3 py-2 text-sm">🎒 身軽</button>
        </div>
      </div>
      <label class="block">
        <span class="text-sm text-neutral-500">宿泊</span>
        <input type="text" value="大島温泉ホテル(三原山温泉)" disabled class="mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-500">
      </label>
    </div>
  </section>

  <section class="mt-4 bg-white rounded-2xl shadow-sm p-4">
    <div class="flex items-center justify-between">
      <h2 class="font-bold text-sea">2. あなたの旅程</h2>
      <div id="dayTabs" class="flex gap-1"></div>
    </div>
    <div id="warnings" class="mt-3 space-y-2"></div>
    <div id="timeline" class="mt-3"></div>
    <div id="fare" class="mt-3 text-sm font-bold"></div>
    <div class="mt-4 border-t border-neutral-100 pt-4">
      <button type="button" id="explainBtn" class="w-full rounded-xl bg-tsubaki text-white font-bold py-3 active:opacity-80">✨ AIガイドの解説を聞く</button>
      <div id="explainText" class="hidden mt-3 rounded-xl bg-sand p-4 text-sm leading-relaxed whitespace-pre-wrap"></div>
    </div>
    <details class="mt-4 text-xs text-neutral-500"><summary>使っているオープンデータ</summary><div id="dataSource" class="mt-2 space-y-1"></div></details>
  </section>
</main>

<div id="modal" class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4" hidden>
  <div class="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto p-5 relative">
    <button type="button" id="modalClose" class="absolute top-3 right-3 text-neutral-400 text-xl" aria-label="閉じる">×</button>
    <div id="modalBody"></div>
  </div>
</div>

<footer class="max-w-2xl mx-auto px-4 py-6 text-xs text-neutral-400">
  SBC.別班連携チーム / 東京都知事杯オープンデータ・ハッカソン 2026<br>
  データ: 大島バス時刻表(GTFS-JP/公式PDF) ・ 気象庁 ・ 東京都オープンデータカタログ ・ 東海汽船
</footer>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: app/public/js/app.js を作成**

`poc/public/js/app.js` をコピーして以下を変更する(planTrip呼び出し・モーダル・状態管理のロジックは一切変えない):

1. `loadData()` に ferry を追加(Task 4 で作る `data/ferry.json`。スタンドアロン版は `window.__DATA__.ferry`)。モジュール先頭の宣言も `let tt, spots, ferry;` に変更し、`load()` の分割代入を `[tt, spots, ferry] = await loadData();` にする。`state` は `{ port: "motomachi", arrival: "10:00", hasLuggage: true, day: 0, plan: null, weather: null }`:

```js
async function loadData() {
  if (typeof window !== "undefined" && window.__DATA__) return [window.__DATA__.timetable, window.__DATA__.spots, window.__DATA__.ferry];
  return Promise.all([
    fetch("data/timetable.json").then((r) => r.json()),
    fetch("data/spots.json").then((r) => r.json()),
    fetch("data/ferry.json").then((r) => r.json()),
  ]);
}
```

2. CSSクラスをTailwindに差し替え。テンプレート関数は次の通り置き換える:

```js
function tabBtn(label, i, active) {
  return `<button class="tab rounded-full px-3 py-1 text-sm ${active ? "bg-sea text-white" : "bg-neutral-100 text-neutral-500"}" data-i="${i}">${esc(label)}</button>`;
}
function warnBox(text, hard) {
  return `<div class="rounded-xl px-3 py-2 text-sm ${hard ? "bg-warn/10 border border-warn/40 text-warn" : "bg-neutral-50 text-neutral-500"}">${esc(text)}</div>`;
}
function unresBox(text) {
  return `<div class="rounded-xl px-3 py-2 text-sm bg-tsubaki/10 border border-tsubaki/40 text-tsubaki">⛔ ${esc(text)}</div>`;
}
function busCard(b) {
  const from = tt.stops[b.from].name, to = tt.stops[b.to].name;
  return `<div class="rounded-xl border-l-4 border-sea bg-white shadow-sm p-3 my-1">
    <div class="flex justify-between items-start gap-2"><b class="text-sm">🚌 ${esc(from)} → ${esc(to)}</b>
      <span class="shrink-0"><span class="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">✅ 時刻表と一致</span>${b.estimated ? '<span class="text-xs rounded-full bg-neutral-100 text-neutral-500 px-2 py-0.5 ml-1">途中時刻は推定</span>' : ""}</span></div>
    <div class="text-xs text-neutral-500 mt-1">${esc(b.dep)}発 → ${esc(b.arr)}着 ／ ${esc(b.routeName)} ／ ${b.fareYen ? b.fareYen + "円" : "運賃未確認"}${b.fareConfirmed ? "" : "(推定)"} ／ 便ID: ${esc(b.tripId)}</div>
  </div>`;
}
```

`renderItem` / `openSpot` / `render` 内の `class="..."` も同系統のユーティリティに揃える(`.tl` リストは `<ul class="space-y-2">`、時刻は `<span class="font-mono text-sea font-bold">` など)。`#explainText` の表示切替は `classList.remove("hidden")` / `classList.add("hidden")` に変更(旧 `.show` は廃止)。

3. 荷物トグルのアクティブ表示は `setLuggage` 内で:

```js
function setLuggage(v) {
  state.hasLuggage = v;
  $("#lugOn").className = `tbtn rounded-xl border px-3 py-2 text-sm ${v ? "bg-tsubaki text-white border-tsubaki" : "bg-white border-neutral-300"}`;
  $("#lugOff").className = `tbtn rounded-xl border px-3 py-2 text-sm ${!v ? "bg-tsubaki text-white border-tsubaki" : "bg-white border-neutral-300"}`;
  render();
}
```

- [ ] **Step 3: 一時的に ferry.json のスタブを置く(Task 4 で本物に差し替え)**

```bash
echo '{"meta":{"source":"stub"},"outbound":[],"inbound":[]}' > app/public/data/ferry.json
```

app.js の `#arrival` はスタブ時は poc と同じ3択をフォールバックで出す:

```js
function arrivalOptions(ferry) {
  const opts = (ferry.outbound || [])
    .filter((s) => s.arriveOshima)
    .map((s) => ({ value: s.arriveOshima, label: `${s.arriveOshima}(${s.shipType} 竹芝${s.depTakeshiba}発)` }));
  if (!opts.length) return [
    { value: "09:35", label: "09:35(ジェット船 竹芝7:25/7:50発)" },
    { value: "10:00", label: "10:00(ジェット船 竹芝8:15発)" },
    { value: "06:00", label: "06:00(大型客船 竹芝23:00発)" },
  ];
  return opts;
}
// load() 内、bind() の前に:
$("#arrival").innerHTML = arrivalOptions(ferry).map((o) => `<option value="${esc(o.value)}" ${o.value === state.arrival ? "selected" : ""}>${esc(o.label)}</option>`).join("");
```

- [ ] **Step 4: CSS再生成 → ローカル起動 → 目視確認**

```bash
cd app && npm run build:css && npm run dev
```

ブラウザで http://localhost:8788/ を開き(またはplaywright-visual-qaスキルで390px幅スクリーンショット):
荷物トグルで旅程が組み替わる / 2日目タブ / スポットモーダルが動くこと。

- [ ] **Step 5: Commit**

```bash
git add app/public && git commit -m "feat(app): tailwind UI — form, timeline, modal, weather chip slots"
```

---

### Task 4: 船ダイヤ(ferry.json) + 帰路情報 + 時刻表期限バナー

**Files:**
- Create: `app/public/data/ferry.json`(スタブを本物に)
- Modify: `app/public/js/planner.js`(帰路notes外部化 — 1行)
- Modify: `app/public/js/app.js`(帰路note注入・期限バナー)
- Test: `app/test/planner.test.mjs`, `app/test/data.test.mjs`

**Interfaces:**
- Produces: `ferry.json = { meta: {source, sourceUrl, validNote}, outbound: [{shipType, depTakeshiba, arriveOshima, note?}], inbound: [{shipType, depOshima, arriveTakeshiba, note?}] }`
- Produces: `planTrip({..., returnNote})` — 省略時は従来文言

- [ ] **Step 1: 東海汽船公式(https://www.tokaikisen.co.jp/)の8月ダイヤを確認し ferry.json を作成**

公式の時刻表ページ(またはpoc/README・docs/itineraryに転記済みの確認値)から、8/22-23に有効な竹芝⇔大島便を転記する。形式:

```json
{
  "meta": {
    "source": "東海汽船 時刻・運賃表(2026年8月)より手入力",
    "sourceUrl": "https://www.tokaikisen.co.jp/",
    "validNote": "就航状況・発着港は当日の海況で変わるため公式で要確認"
  },
  "outbound": [
    { "shipType": "ジェット船", "depTakeshiba": "07:25", "arriveOshima": "09:35" },
    { "shipType": "ジェット船", "depTakeshiba": "08:15", "arriveOshima": "10:00" },
    { "shipType": "大型客船", "depTakeshiba": "23:00", "arriveOshima": "06:00", "note": "翌朝着" }
  ],
  "inbound": [
    { "shipType": "大型客船", "depOshima": "14:20", "arriveTakeshiba": "18:40" }
  ]
}
```

(↑の時刻は README で「✅確認済み」とされている値。**必ず公式サイトと突き合わせ**、便の増減を反映する)

- [ ] **Step 2: planner.js の帰路ハードコードをパラメータ化する失敗テストを追加**

`app/test/planner.test.mjs` に追記:

```js
test("planTrip: returnNote を渡すと2日目最後のイベントに反映される", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true, returnNote: "帰りの船: テスト便 15:00発" });
  const last = p.days[1].items.at(-1);
  assert.equal(last.type, "event");
  assert.ok(last.note.includes("テスト便 15:00発"));
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd app && npm test` — Expected: FAIL(returnNote 未実装)

- [ ] **Step 4: planner.js を最小変更**

`planTrip` のシグネチャを `export function planTrip({ tt, spots, port = "motomachi", arrival = "10:00", hasLuggage = true, returnNote })` にし、港到着イベント(現在 `note: "帰りの船：大型客船 14:20発→竹芝18:40着(8月毎日・要最終確認)。午後のジェット船は要確認"`)を:

```js
day2.push({ type: "event", time: c3.arr, title: "港に到着", note: returnNote || "帰りの船は東海汽船公式で要確認" });
```

- [ ] **Step 5: app.js から ferry.json 由来の returnNote を渡す**

`render()` 内の planTrip 呼び出しを:

```js
const ret = (ferry.inbound || [])[0];
state.plan = planTrip({ tt, spots, port: state.port, arrival: state.arrival, hasLuggage: state.hasLuggage,
  returnNote: ret ? `帰りの船: ${ret.shipType} ${ret.depOshima}発 → 竹芝${ret.arriveTakeshiba}着(${ferry.meta.validNote})` : undefined });
```

- [ ] **Step 6: データ整合テストを追加 — app/test/data.test.mjs**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const tt = JSON.parse(readFileSync(new URL("../public/data/timetable.json", import.meta.url)));
const spots = JSON.parse(readFileSync(new URL("../public/data/spots.json", import.meta.url)));
const ferry = JSON.parse(readFileSync(new URL("../public/data/ferry.json", import.meta.url)));

test("timetable: 全tripのstopIdはstops定義に存在する", () => {
  for (const trip of tt.trips) for (const s of trip.stops) assert.ok(tt.stops[s.stopId], `${trip.tripId}: ${s.stopId}`);
});
test("spots: 全スポットのstopIdはstops定義に存在する", () => {
  for (const [id, s] of Object.entries(spots)) assert.ok(tt.stops[s.stopId], `${id}`);
});
test("ferry: 便に必須フィールドがある", () => {
  assert.ok(ferry.outbound.length >= 1, "outboundが空");
  for (const s of ferry.outbound) { assert.ok(s.shipType); assert.ok(s.depTakeshiba); assert.ok(s.arriveOshima); }
  for (const s of ferry.inbound) { assert.ok(s.shipType); assert.ok(s.depOshima); assert.ok(s.arriveTakeshiba); }
});
```

- [ ] **Step 7: 期限バナー — app.js の load() に追加**

```js
function checkStale(tt) {
  const today = new Date().toISOString().slice(0, 10);
  if (tt.meta.validTo && today > tt.meta.validTo) {
    const el = $("#staleBanner");
    el.textContent = `⚠ この時刻表の有効期間(〜${tt.meta.validTo})を過ぎています。最新ダイヤを確認してください。`;
    el.classList.remove("hidden");
  }
}
// load() 内で bind() の後に checkStale(tt);
```

- [ ] **Step 8: 全テスト実行**

Run: `cd app && npm test` — Expected: 全PASS(既存9 + 新規4)

- [ ] **Step 9: Commit**

```bash
git add app && git commit -m "feat(app): ferry timetable data, return-ferry note, stale-timetable banner"
```

---

### Task 5: プロンプト組立ライブラリ(純粋関数 + テスト)

**Files:**
- Create: `app/functions/api/_lib/prompt.mjs`
- Test: `app/test/prompt.test.mjs`

**Interfaces:**
- Produces: `SYSTEM_PROMPT: string`, `buildExplainPrompt({itinerary, conditions, weather}): string`, `fallbackExplain(conditions): string` — Task 6, 7 が使用

- [ ] **Step 1: 失敗テストを書く — app/test/prompt.test.mjs**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_PROMPT, buildExplainPrompt, fallbackExplain } from "../functions/api/_lib/prompt.mjs";

const itinerary = { days: [{ label: "1日目", items: [{ type: "bus", tripId: "MIHARA_UP_1020", dep: "10:20", arr: "10:28" }] }], warnings: [], fareTotal: 1090 };

test("SYSTEM_PROMPT: 時刻を発明しないルールと4見出し構成を含む", () => {
  assert.ok(SYSTEM_PROMPT.includes("旅程JSONに書かれているものだけ"));
  for (const h of ["この旅程のポイント", "荷物についての注意", "雨天時の代替案", "ひとこと観光ガイド"]) assert.ok(SYSTEM_PROMPT.includes(h), h);
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
test("fallbackExplain: 荷物有無で文面が変わる", () => {
  assert.notEqual(fallbackExplain({ hasLuggage: true, port: "motomachi" }), fallbackExplain({ hasLuggage: false, port: "motomachi" }));
});
```

- [ ] **Step 2: 失敗を確認** — Run: `cd app && npm test` — Expected: FAIL (module not found)

- [ ] **Step 3: app/functions/api/_lib/prompt.mjs を実装**

```js
// prompt.mjs — /api/explain のプロンプト組立。純粋関数のみ(node --test で検証)。
export const SYSTEM_PROMPT = `あなたは伊豆大島の旅を案内する親しみやすいローカルガイドです。
ユーザーの1泊2日の旅程(JSON)を読み、日本語で解説を書いてください。

厳守するルール:
- 時刻・運賃・便名・バス停名は、旅程JSONに書かれているものだけを使うこと。新しい時刻や便を作らない。
- 旅程JSONにない施設の営業時間や料金を断定しない(「要確認」と添える)。
- 出力はMarkdown。次の4見出し(###)の構成で、全体で400〜600字:
### この旅程のポイント
### 荷物についての注意
### 雨天時の代替案
### ひとこと観光ガイド
- 雨天時の代替案では、天気予報が渡されていればそれを踏まえる。屋内・平坦な場所(椿・花ガーデン、郷土資料館、温泉など)を優先して提案し、便の時刻は旅程JSONにあるものだけを引用する。`;

export function buildExplainPrompt({ itinerary, conditions, weather }) {
  const parts = [
    "次の旅程の解説を書いてください。",
    "## 旅の条件(JSON)",
    JSON.stringify(conditions),
    "## 旅程(JSON)",
    JSON.stringify(itinerary),
  ];
  if (weather) parts.push("## 天気予報(JSON)", JSON.stringify(weather));
  return parts.join("\n");
}

// Claude API 障害時のフォールバック(pocのexplain()と同内容)
export function fallbackExplain({ hasLuggage, port }) {
  const p = port === "okada" ? "岡田港" : port === "motomachi" ? "元町港" : "港";
  if (hasLuggage) {
    return `${p}に着いたら、キャリーケースを持ったまま10分ほどでバス停へ。1本目のバスで椿・花ガーデンに向かい、平坦な園内をのんびり回ってお弁当ランチ。次のバスで大島温泉ホテルへ移動して荷物を預ければ、あとは身軽です。三原山は2日目のお楽しみ。荷物を持って山に登る必要はありません。`;
  }
  return `身軽なら1日目から三原山へ直行できます。${p}からのバスで山頂口へ上がり、火口方面を歩いたあと、バスで大島温泉ホテルへ。2日目はもう一度、朝いちばんのバスで山へ戻って裏砂漠まで足をのばすのもおすすめです。`;
}
```

- [ ] **Step 4: テスト緑を確認** — Run: `cd app && npm test` — Expected: 全PASS

- [ ] **Step 5: Commit**

```bash
git add app/functions app/test/prompt.test.mjs && git commit -m "feat(app): explain prompt builder with no-invented-times rule (tested)"
```

---

### Task 6: /api/explain — Claude SSEエンドポイント

**Files:**
- Create: `app/functions/api/explain.ts`
- Create: `app/.dev.vars.example`

**Interfaces:**
- Consumes: `SYSTEM_PROMPT, buildExplainPrompt`(prompt.mjs)
- Produces: `POST /api/explain` — body `{itinerary, conditions, weather}` → SSE。イベント: `data:`(テキスト断片のJSON文字列) / `event: fallback`(クライアントはテンプレ表示に切替) / `event: done`

- [ ] **Step 1: app/functions/api/explain.ts を実装**

```ts
// Pages Function: POST /api/explain — 旅程JSON → Claudeの解説をSSEで返す
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildExplainPrompt } from "./_lib/prompt.mjs";

const MODEL = "claude-opus-5";

export async function onRequestPost(ctx: { request: Request; env: { ANTHROPIC_API_KEY: string }; waitUntil: (p: Promise<unknown>) => void }) {
  let body: { itinerary: unknown; conditions: unknown; weather: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30_000 });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const sse = (s: string) => writer.write(enc.encode(s));

  ctx.waitUntil((async () => {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 2000, // 400〜600字の解説なので意図的に小さく
        output_config: { effort: "low" }, // 短い定型解説。品質不足なら "medium" へ
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildExplainPrompt(body as never) }],
      });
      stream.on("text", (t) => { sse(`data: ${JSON.stringify(t)}\n\n`); });
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        await sse(`event: fallback\ndata: "refusal"\n\n`);
      }
      await sse(`event: done\ndata: {}\n\n`);
    } catch (e) {
      // SDKが1回リトライ済み。ここに来たらクライアント側テンプレにフォールバック
      await sse(`event: fallback\ndata: ${JSON.stringify(String(e))}\n\n`);
      await sse(`event: done\ndata: {}\n\n`);
    } finally {
      await writer.close();
    }
  })());

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
```

- [ ] **Step 2: app/.dev.vars.example を作成**(実キーは `.dev.vars` に置く。gitignore済み)

```
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

- [ ] **Step 3: ローカルで実際に叩いて確認**(要 `.dev.vars` に実キー)

```bash
cd app && cp .dev.vars.example .dev.vars  # 手で実キーに書き換える
npm run dev &
sleep 5
curl -N -X POST http://localhost:8788/api/explain -H "Content-Type: application/json" \
  -d '{"itinerary":{"days":[{"label":"1日目","items":[{"type":"bus","tripId":"MIHARA_UP_1020","dep":"10:20","arr":"10:28","from":"PORT","to":"TSUBAKI"}]}],"fareTotal":300},"conditions":{"hasLuggage":true,"port":"motomachi"},"weather":null}'
```

Expected: `data: "..."` のSSE断片が流れ、`### この旅程のポイント` を含む日本語解説 → `event: done`。時刻は 10:20/10:28 以外が出ないこと(目視)。

- [ ] **Step 4: Commit**

```bash
git add app/functions/api/explain.ts app/.dev.vars.example && git commit -m "feat(app): /api/explain — claude-opus-5 SSE with refusal/error fallback events"
```

---

### Task 7: フロント統合 — AI解説ストリーミング表示

**Files:**
- Modify: `app/public/js/app.js`

**Interfaces:**
- Consumes: `POST /api/explain` のSSE仕様(Task 6)、`explain(plan, spots)`(planner.js のテンプレ版)

- [ ] **Step 1: app.js の explainBtn ハンドラを差し替え**

```js
$("#explainBtn").addEventListener("click", () => runExplain());

async function runExplain() {
  const el = $("#explainText");
  const btn = $("#explainBtn");
  el.classList.remove("hidden");
  el.textContent = "";
  btn.disabled = true;
  btn.textContent = "✨ AIガイドが考えています…";
  try {
    await streamExplain(state.plan, state.weather, (t) => { el.textContent += t; });
    btn.textContent = "✨ もう一度きく";
  } catch {
    el.textContent = explain(state.plan, spots);
    el.insertAdjacentHTML("beforeend", '<div class="mt-2 text-xs text-neutral-400">※ AI解説を取得できなかったため簡易版を表示しています</div>');
    btn.textContent = "✨ AIガイドの解説を聞く";
  } finally {
    btn.disabled = false;
  }
}

async function streamExplain(plan, weather, onText) {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itinerary: plan, conditions: plan.input, weather }),
  });
  if (!res.ok || !res.body) throw new Error(`explain http ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", ev = "message", got = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trimEnd();
      buf = buf.slice(nl + 1);
      if (line.startsWith("event: ")) ev = line.slice(7);
      else if (line.startsWith("data: ")) {
        if (ev === "fallback") throw new Error("server fallback");
        if (ev === "message") { onText(JSON.parse(line.slice(6))); got = true; }
        ev = "message";
      }
    }
  }
  if (!got) throw new Error("empty stream");
}
```

`state` に `weather: null` を追加(Task 8 が設定)。旅程を組み替えたら古い解説は隠す: `render()` 冒頭の `$("#explainText").classList.remove("show")` を `$("#explainText").classList.add("hidden")` に。

- [ ] **Step 2: 動作確認(オンライン+フォールバック両方)**

```bash
cd app && npm run dev
```

1. ブラウザでボタン押下 → 解説が逐次表示される
2. `.dev.vars` のキーを `sk-ant-invalid` に変えて再起動 → ボタン押下 → 簡易版が表示され「※ AI解説を取得できなかった…」が出る → キーを戻す

- [ ] **Step 3: Commit**

```bash
git add app/public/js/app.js && git commit -m "feat(app): streaming AI explain UI with template fallback"
```

---

### Task 8: /api/weather — 気象庁プロキシ + 天気チップ

**Files:**
- Create: `app/functions/api/weather.ts`
- Modify: `app/public/js/app.js`(チップ描画)

**Interfaces:**
- Produces: `GET /api/weather` → `{ forecast: [{date, weather, pop}], source: string }` または `{ unavailable: true }`。`forecast` は伊豆諸島北部(大島)の向こう2日分

- [ ] **Step 1: 気象庁JSONの実際の構造を確認**

```bash
curl -s "https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json" | python3 -m json.tool | head -80
```

`timeSeries[0].areas[]` から `area.name` が「伊豆諸島北部」の要素を特定し、`timeDefines` と `weathers`、`timeSeries[1]`(降水確率 `pops`)の対応を確認する。**以下の実装はこの確認結果に合わせて添字を調整すること。**

- [ ] **Step 2: app/functions/api/weather.ts を実装**

```ts
// Pages Function: GET /api/weather — 気象庁の東京都予報から伊豆諸島北部(大島)を抽出
const JMA_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json";

export async function onRequestGet(ctx: { request: Request }) {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL(ctx.request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let payload: unknown;
  try {
    const r = await fetch(JMA_URL, { headers: { "User-Agent": "oshima-smart-course (hackathon demo)" } });
    if (!r.ok) throw new Error(`jma ${r.status}`);
    const data = (await r.json()) as Array<{ timeSeries: Array<{ timeDefines: string[]; areas: Array<{ area: { name: string }; weathers?: string[]; pops?: string[] }> }> }>;
    const ts = data[0].timeSeries;
    const wArea = ts[0].areas.find((a) => a.area.name.includes("伊豆諸島北部"));
    const pArea = ts[1]?.areas.find((a) => a.area.name.includes("伊豆諸島北部"));
    if (!wArea) throw new Error("area not found");
    const forecast = ts[0].timeDefines.slice(0, 2).map((t, i) => ({
      date: t.slice(0, 10),
      weather: (wArea.weathers?.[i] ?? "").replace(/\s+/g, " "),
      pop: pArea?.pops?.slice(0, 4).filter((p) => p !== "")[i] ?? null,
    }));
    payload = { forecast, source: "気象庁 天気予報JSON(東京都)" };
  } catch {
    payload = { unavailable: true };
  }
  const res = new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
  if (!(payload as { unavailable?: boolean }).unavailable) await cache.put(cacheKey, res.clone());
  return res;
}
```

- [ ] **Step 3: ローカルで確認**

```bash
cd app && npm run dev &
sleep 5 && curl -s http://localhost:8788/api/weather | python3 -m json.tool
```

Expected: `forecast` に2件、`weather` に「晴れ」等の文字列。

- [ ] **Step 4: app.js に天気チップ描画を追加**

```js
async function loadWeather() {
  try {
    const w = await fetch("/api/weather").then((r) => r.json());
    if (w.unavailable) throw new Error("unavailable");
    state.weather = w;
    $("#weatherChips").innerHTML = w.forecast.map((f) =>
      `<span class="text-xs rounded-full bg-white/20 px-2 py-1">${esc(f.date.slice(5).replace("-", "/"))} ${esc(f.weather.split("　")[0])}${f.pop != null ? ` ☔${esc(f.pop)}%` : ""}</span>`
    ).join("");
  } catch {
    state.weather = null;
    $("#weatherChips").innerHTML = '<span class="text-xs opacity-60">天気情報を取得できませんでした</span>';
  }
}
// load() 内で render() の後に loadWeather();  ※awaitしない(旅程表示をブロックしない)
```

- [ ] **Step 5: 動作確認** — ブラウザでヘッダーに天気チップ2件が出ること。AI解説に天気が反映されること(雨予報の日に「雨天時の代替案」が具体化する)。

- [ ] **Step 6: Commit**

```bash
git add app/functions/api/weather.ts app/public/js/app.js && git commit -m "feat(app): JMA weather proxy with 1h cache + header chips, weather-aware AI explain"
```

---

### Task 9: スポット情報を東京都オープンデータカタログで補強

**Files:**
- Modify: `app/public/data/spots.json`
- Modify: `app/public/js/app.js`(モーダルに出典表示)

- [ ] **Step 1: カタログで大島町の観光データを探す**

https://catalog.data.metro.tokyo.lg.jp/ で「大島町 観光」「大島町 観光施設」を検索。見つかったデータセット(CSV/GeoJSON)から、既存4スポット(椿・花ガーデン/大島温泉ホテル/三原山頂口/元町・岡田港)に該当する行の名称・所在地・説明を取得する。該当が無いスポットは大島町公式(https://www.town.oshima.tokyo.jp/)を出典にする。

- [ ] **Step 2: spots.json の各スポットに `sourceName` と `sourceUrl` を追加**(既存フィールドは変更しない)

```json
"TSUBAKI": {
  "...既存フィールドそのまま...": "...",
  "sourceName": "東京都オープンデータカタログ(データセット名をここに)",
  "sourceUrl": "https://catalog.data.metro.tokyo.lg.jp/dataset/(実際のID)"
}
```

- [ ] **Step 3: data.test.mjs にテスト追加**

```js
test("spots: 全スポットに出典がある", () => {
  for (const [id, s] of Object.entries(spots)) { assert.ok(s.sourceName, id); assert.ok(s.sourceUrl, id); }
});
```

Run: `cd app && npm test` — Expected: PASS

- [ ] **Step 4: モーダル(openSpot)の末尾に出典行を追加**

```js
`<div class="mt-3 text-xs text-neutral-400">出典: <a class="underline" href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${esc(s.sourceName)}</a></div>`
```

- [ ] **Step 5: Commit**

```bash
git add app/public/data/spots.json app/test/data.test.mjs app/public/js/app.js && git commit -m "feat(app): spot provenance from Tokyo open data catalog"
```

---

### Task 10: スタンドアロン版ビルド(現地オフライン検証用)

**Files:**
- Create: `app/scripts/build_standalone.py`(pocベースで修正)

- [ ] **Step 1: poc/scripts/build_standalone.py をコピーし以下を変更**

```bash
cp poc/scripts/build_standalone.py app/scripts/
```

変更点(4箇所):
1. `OUT = ROOT / "dist" / "oshima-smart-course.html"` はそのまま
2. `css = read("style.css")` → `css = read("css/styles.css")`、置換対象タグを `'<link rel="stylesheet" href="css/styles.css">'` に
3. `data` に ferry を追加: `"ferry": json.loads(read("data/ferry.json"))`
4. `<title>大島スマートコース</title>` → `<title>大島スマートコース(スタンドアロン版)</title>` に置換するよう文字列を更新

- [ ] **Step 2: ビルドして file:// で開く**

```bash
cd app && npm run build:css && npm run build:standalone && open dist/oshima-smart-course.html
```

Expected: サーバーなしで旅程生成・タブ・モーダルが動く。AI解説ボタンはfetch失敗→簡易版表示(Task 7のフォールバックがそのまま効く)。天気チップは「取得できませんでした」表示。

- [ ] **Step 3: Commit**

```bash
git add app/scripts/build_standalone.py && git commit -m "feat(app): offline standalone build for field test"
```

---

### Task 11: PR + デプロイ

**Files:** なし(運用)

- [ ] **Step 1: PR作成・マージ**

```bash
git push origin feature/oshima-app
gh pr create --title "feat: 伊豆大島スマートモデルコース 公開アプリ" --body "docs/superpowers/specs/2026-08-21-oshima-app-design.md の実装

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

レビュー(superpowers:requesting-code-review)後にマージ。

- [ ] **Step 2: Cloudflareアカウント準備(ユーザー作業)** — アカウント作成/ログイン → `npx wrangler login`

- [ ] **Step 3: デプロイ + シークレット設定**

```bash
cd app && npm run build:css
npx wrangler pages project create oshima-smart-course --production-branch main
npx wrangler pages deploy public
npx wrangler pages secret put ANTHROPIC_API_KEY  # プロンプトで実キーを入力
```

- [ ] **Step 4: 本番スモークテスト**

デプロイURLで: 旅程生成 / AI解説ストリーミング / 天気チップ / スマホ実機表示 を確認。

- [ ] **Step 5: READMEにデモURLを追記してコミット**

---

### Task 12: (トークン到着時) GTFS差し替え

**Files:**
- Modify: `app/public/data/timetable.json`(生成物で置換)

- [ ] **Step 1: ODPTからGTFS取得(コミットしない)**

```bash
curl -o /tmp/AllLines.zip "https://api.odpt.org/api/v4/files/odpt/OshimaBus/AllLines.zip?date=20260701&acl:consumerKey=$ODPT_TOKEN"
```

- [ ] **Step 2: 変換 → テスト**

```bash
cd app && npm run build:gtfs -- /tmp/AllLines.zip --date 20260822 && npm test
```

`build_gtfs.py` の出力仕様が現行 timetable.json と一致するか確認し、テストが落ちたら期待値(便の時刻)を実GTFSに合わせて更新する。**時刻表の正が変わるのでテスト側を直す**(ロジックは触らない)。

- [ ] **Step 3: meta.generatedBy が "build_gtfs.py" になっていることを確認し、フッター表記を「GTFS-JP(ODPT)」に更新**

- [ ] **Step 4: Commit + 再デプロイ**

```bash
git add app/public/data/timetable.json && git commit -m "data(app): switch timetable to ODPT GTFS-JP"
npx wrangler pages deploy public
```
