# 🏝️ 大島スマートコース — 実証デモWebアプリ（`app/`）

キャリーケースの有無で伊豆大島1泊2日の旅程が組み替わることを示すデモ。
旅程は**ブラウザ内で確定計算**（実在するバス便だけを使う）、Claude APIは**解説文の生成のみ**に使い、失敗時はテンプレ文にフォールバックします。

**公開URL（本番）**

| URL | デプロイ方法 |
|---|---|
| https://izu-oshima-smart-tourism.kotaroshimada38.workers.dev | **main へのpushで自動デプロイ**（Cloudflare Workers Builds） |
| https://oshima-smart-course.pages.dev | Pages 直アップロード（手動） |

---

## ローカルで起動する

```bash
cd app
npm install
npm test                 # planner / data / prompt / SSE のテスト（node --test）
cp .dev.vars.example .dev.vars   # ANTHROPIC_API_KEY を設定（なくてもテンプレ文で動く）
npm run dev:node         # → http://localhost:8788/
```

- **`npm run dev:node`** … Node製の開発サーバ（`scripts/dev-node.mjs`）。静的ファイル配信と `/api/*`（Pages Functions）をNodeだけで再現する。**macOS 12以下でも動く**（このリポジトリの検証環境）
- **`npm run dev`**（= `wrangler pages dev`）… 本物のCloudflareランタイム（workerd）。**macOS 13.5+ / Linux 専用**。macOS 12以下では `Unsupported macOS version` エラーになるので `dev:node` を使う
- AI解説はAPIキー未設定・API失敗時とも**テンプレ文にフォールバック**するため、キーなしでデモは成立する

## よく使うコマンド

| コマンド | 用途 |
|---|---|
| `npm test` | 全テスト実行（node --test） |
| `npm run build:css` | Tailwind v4 で `src/styles.css` → `public/css/styles.css` を再生成（**CSSを触ったら必須**） |
| `npm run watch:css` | 同上のwatchモード |
| `npm run build:standalone` | `dist/oshima-smart-course.html` を生成。**サーバー不要・file://で開ける現地オフライン検証用**（要 `build:css` 済み） |
| `ODPT_TOKEN=<トークン> npm run gtfs:update` | **ODPTの実GTFSをダウンロード→timetable.json差し替え→テストまで一発**（トークンは https://developer.odpt.org/ ログイン後に取得。それまでは公式PDF起こしの手入力時刻表） |
| `npm run build:gtfs -- AllLines.zip --date 20260822` | 手元のGTFS zipから変換だけ行う場合 |

## Cloudflare へデプロイする

**通常は何もしなくてよい。** main にマージすると Cloudflare Workers Builds が自動でビルド・デプロイします。
設定はリポジトリルートの [`../wrangler.jsonc`](../wrangler.jsonc)（アセット= `app/public`）と [`../worker/index.js`](../worker/index.js)（`functions/api/` のPages Functionsを呼ぶルーター）。

手動デプロイとAPIキー設定：

```bash
# ── Worker版（本番・自動デプロイと同じもの）── リポジトリルートで実行
npx wrangler login                         # 初回のみ
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY  # AI解説を有効にする場合のみ

# ── Pages版（任意）── app/ で実行
npx wrangler pages deploy public           # プロジェクト名等は wrangler.toml から
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name oshima-smart-course
```

> ⚠️ `/api/explain` は Anthropic SDK（`node:` モジュール）を使うため **`nodejs_compat` フラグが必須**。ルート `wrangler.jsonc` と `app/wrangler.toml` の両方に設定済み（消すとデプロイ先で実行時エラー）。

## ディレクトリ構成

```
app/
├── public/            # 静的アセット（デプロイされるのはここ + /api/*）
│   ├── index.html
│   ├── css/styles.css     # 生成物。編集は src/styles.css → npm run build:css
│   ├── js/planner.js      # 旅程の確定計算（純粋関数・テスト対象）
│   ├── js/app.js          # UI・SSE受信・フォールバック
│   └── data/              # timetable.json（手入力時刻表）/ spots.json / ferry.json
├── functions/api/     # Pages Functions
│   ├── explain.js         # POST /api/explain — claude-opus-5 の解説をSSEで返す
│   ├── weather.js         # GET /api/weather — 気象庁予報（伊豆諸島北部）プロキシ
│   └── _lib/prompt.mjs    # プロンプト組立（「時刻表にない便を発明しない」ルール）
├── scripts/           # dev-node.mjs / build_standalone.py / build_gtfs.py
├── test/              # planner / data / prompt / SSE のテスト
└── wrangler.toml      # Pages用設定（プロジェクト名 oshima-smart-course）
```

## データの注意

- 時刻表は**公式PDF起こしの手入力**（ODPT GTFSの承認待ちのため）。有効期限を過ぎると画面に注記バナーが出る
- スポット情報の出典は大島町公式サイト（東京都オープンデータカタログに大島町の観光スポットデータが未登録のため）
- 旅程地図は **Leaflet + OpenStreetMap**。座標（`public/data/geo.json`）は**OSM由来**で、ODPT GTFSの停留所座標は使っていない（ライセンス方針）。オフライン時・スタンドアロン版でタイルが取れない場合は地図だけ非表示になり他は動く
- 時刻・運賃は2026年8月時点。必ず公式サイトで最終確認すること
