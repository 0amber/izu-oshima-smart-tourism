# 大島スマートコース PoC

GTFS（バス時刻表データ）× キャリーケース有無 で、伊豆大島の1泊2日旅程を自動で組む試作。
ロジックは `public/js/planner.js`（純粋関数・テスト付き）、UIは `public/index.html` + `app.js`。

## みんなが開く方法（3つ）

| 方法 | 手順 | 向いている場面 |
|---|---|---|
| **A. 1ファイルHTMLを配る**（いちばん簡単） | `dist/oshima-smart-course.html` を Slack/LINE/メールで送る → 受け取った人は**ダブルクリックで開くだけ**（サーバー不要・オフラインOK） | チーム内レビュー、現地でのフィールドテスト（電波なしでも動く） |
| **B. Cloudflare Pages に公開**（URL共有） | Cloudflare → Workers & Pages → Create → Pages → 「Upload assets」で `public/` の中身をドラッグ＆ドロップ（または `npx wrangler pages deploy public --project-name oshima-smart-course`）→ `https://xxxx.pages.dev/` を共有 | 審査用デモURL、スマホからのアクセス |
| **C. ローカルサーバー**（開発中） | `npm run dev` → http://localhost:8788/ 。同じWi-Fiなら `http://<自分のIP>:8788/` で他人のスマホからも見える | 開発・その場でのデモ |

> `public/index.html` を直接ダブルクリックしても動きません（ES module と fetch を使っているため、`file://` ではJSONが読めない）。配布したいときは A の `dist/` 版を使ってください。

## コマンド

```bash
npm test                 # planner.js のテスト（node --test）
npm run dev              # ローカルサーバー http://localhost:8788/
npm run build:standalone # public/ → dist/oshima-smart-course.html（配布用1ファイル）
npm run build:gtfs -- AllLines.zip --date 20260822   # ODPTのGTFS zip → public/data/timetable.json
```

`public/` を編集したら `npm run build:standalone` を実行して `dist/` を更新すること。

## 構成

```
public/
  index.html  style.css
  js/planner.js   ロジック（nextBus / planTrip / explain）
  js/app.js       画面
  data/timetable.json  三原山ライン時刻表（現状は公式PDFから手入力。GTFS取得後に差し替え）
  data/spots.json      スポット表（荷物適性スコアなど）
scripts/build_gtfs.py        GTFS zip → timetable.json
scripts/build_standalone.py  1ファイルHTML生成
dist/oshima-smart-course.html  配布用（生成物）
test/planner.test.mjs
```

## 現状の割り切り

- 時刻表は三原山ラインの主要便のみ（8月毎日ダイヤ）。下り便の途中停留所時刻は推定。
- 一部運賃は推定（`fares.confirmed=false`）。
- 説明文はテンプレ。LLM連携は `/api/explain` を後付けする想定。
