# 伊豆大島スマートモデルコース 公開アプリ 設計書

日付: 2026-08-21 / 対象: 東京都知事杯オープンデータ・ハッカソン2026 提出物
締切: 2026-08-23 (日) 17:00 / 現地検証: 8/22-23

## 1. 概要

既存PoC (`poc/`) の旅程プランナーを核に、Cloudflare Pages + Functions で公開する
Webアプリを `app/` に構築する。オープンデータ (大島バスGTFS・気象庁・都カタログ・船ダイヤ) と
生成AI (Claude API) をフル活用する。

- 体験: フォーム型プランナー + Claude による旅程解説 (チャットではない)
- 旅程計算はブラウザ内で確定的に実行。Claudeは解説文のみ担当し時刻を発明させない
- ODPT GTFSトークンは承認待ち。手入力時刻表で先行し、到着後 `build_gtfs.py` で差し替え
- `poc/` は提出書類・動画から参照済みのため壊さず残す

## 2. 構成

```
app/
  package.json          devDependencies: @tailwindcss/cli
  wrangler.toml         Pages設定。ANTHROPIC_API_KEY はシークレット
  src/styles.css        Tailwind v4 エントリ + @theme トークン
  public/
    index.html          単一画面 (フォーム → 旅程 → AI解説・天気)
    css/styles.css      Tailwind生成物
    js/planner.js       旅程ロジック (pocから移植・テスト済み)
    js/app.js           画面制御
    data/timetable.json 時刻表 (手入力→GTFS差し替え)
    data/spots.json     スポット (都オープンデータカタログで補強)
    data/ferry.json     東海汽船ダイヤ (手入力・出典URL付き)
  functions/api/
    explain.ts          POST: 旅程JSON → Claude解説 (SSEストリーミング)
    weather.ts          GET: 気象庁JSONプロキシ + 1hキャッシュ
  scripts/
    build_gtfs.py       ODPT GTFS zip → timetable.json (poc流用)
    build_standalone.py 1ファイルHTML生成 (現地オフライン検証用)
  test/planner.test.mjs node --test
```

## 3. UI — Tailwind CSS

- Tailwind CLI (v4) でビルド時生成。CDN版は不採用 (本番非推奨・オフライン版が壊れる)
- デザイントークンは `@theme` で一元管理: `--color-tsubaki` (椿の赤 #c0392b)、
  `--color-sea` (#1a6b8a)、`--color-sand` (#faf7f2)、`--color-warn` (#b7791f)
- ルール: (1) 色・フォントはトークン経由、生の任意値クラス禁止 (2) 繰り返し部品は
  JSテンプレート関数にクラスを集約 (3) モバイルファースト、ブレークポイントは `sm:` のみ
  (4) 状態は `.is-loading` 等のクラスで表現
- `npm run build:css` で再生成。standalone版には生成CSSをインライン化

## 4. API仕様とデータフロー

フロー: ①データJSON読込 → ②天気取得・表示 → ③フォーム入力 → ④planner.jsが
ブラウザ内で旅程生成 → ⑤旅程を即表示 (AI不要で成立) → ⑥`/api/explain` でAI解説をSSE表示

### GET /api/weather
- 気象庁公開JSON (東京都 130000・伊豆諸島北部) を `{forecast, warnings}` に整形
- `caches.default` で1時間キャッシュ。障害時は `{unavailable: true}` (旅程機能は無傷)

### POST /api/explain
- 入力: `{ itinerary, conditions: {luggage, port, dates}, weather }`
- `@anthropic-ai/sdk` で `claude-opus-5` を呼ぶ。ストリーミング必須 (SSE中継)
- システムプロンプト: 時刻・運賃・便名は入力JSONにあるものだけ使用。出力構成は
  「旅程のポイント / 荷物の注意 / 雨天時の代替案 / ひとこと観光ガイド」
- 失敗時 (429/5xx/refusal): 1回リトライ → pocのテンプレート解説にフォールバック。
  画面には「AI解説 (簡易版)」と表示。デモが止まらないことを最優先
- APIキーは `wrangler secret` のみ。クライアントに出さない

### オープンデータの出自 (フッターに明記)

| データ | 取得方法 | 更新 |
|---|---|---|
| バス時刻表 | 公式PDF手入力 → ODPT GTFS で差し替え | ビルド時 |
| 天気・警報 | 気象庁JSON | 実行時 (1hキャッシュ) |
| スポット | 東京都オープンデータカタログ | ビルド時 |
| 船ダイヤ | 東海汽船公式より手入力 | ビルド時 |

## 5. エラー処理と現地検証モード

原則: **旅程は必ず出る**。落ちてよいのは装飾 (AI解説・天気) だけ。

| 障害 | ふるまい |
|---|---|
| Claude障害/30秒タイムアウト | リトライ1回 → テンプレート解説フォールバック |
| `stop_reason: "refusal"` | 同上 |
| 気象庁障害 | 天気チップ非表示 + 小さく注記 |
| データJSON読込失敗 | 唯一の致命エラー。再読込ボタン付きエラー画面 |
| 時刻表 validTo 超過 | 警告バナー自動表示 |

現地検証: `build_standalone.py` で全アセット・データをインライン化した1ファイルHTMLを
生成。オフラインでも旅程生成が動く (AI解説・天気はオンライン時のみ)。
元町港/岡田港の当日切替をUI最上部に配置。

## 6. テスト

- `planner.test.mjs`: poc既存ケース + 船ダイヤ接続・帰路検証を追加 (`node --test`)
- `explain.ts`: プロンプト組立を純粋関数に切り出し単体テスト (Claude呼び出しはモック)
- 仕上げ: playwright-visual-qa でスマホ幅 (390px) の見た目確認

## 7. プロジェクト管理 (GitHub)

- 公開リポジトリ (0amber アカウント)。Issues + PRフロー: タスクをIssue化し、
  featureブランチ → PR → main マージ
- 公開リポジトリに含めない: GTFS zip (ライセンス上復元可能な再配布禁止)、APIキー、
  `.playwright-mcp/` (gitignore済み)

## 8. スケジュール

- 8/21: app/ 骨組み + Tailwind + planner移植 + /api/explain → `wrangler pages dev` で完動
- 8/22: /api/weather + UI磨き込み + standalone生成。Cloudflareアカウント取得 → デプロイ
- 8/23 午前: 現地フィードバック反映 → 17:00 提出
- ODPTトークン到着時: `build_gtfs.py` → timetable.json 差し替え (30分想定)。未着でも成立

## 9. 検討して不採用にした案

- Hono + D1/KV フルスタック: 残り2日でのセットアップコスト過大。共有機能はURLパラメータで代替可
- ブラウザから直接Claude呼び出し: APIキー露出のため不採用
- Tailwind CDN版: 本番非推奨・オフライン配布版が壊れるため不採用
