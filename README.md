# 🏝️ 大島スマートコース — AIが読める伊豆大島の交通・観光ナレッジ

**チーム**：SBC.別班連携チーム　**大会**：東京都知事杯オープンデータ・ハッカソン（ODH）2026
**更新日**：2026年8月21日　**⚠️ First Stage 提出締切：8月23日（日）17:00**

> 「✅ 確認済み」は出典があること、「❓ 未確認」はまだ誰も確かめていないことです。
> 用語がわからないときは最後の「用語ミニ辞典」へ。

---

## ひとことで言うと

**伊豆大島のバス時刻表（GTFS）と「現地でしか分からない事情」を、ChatGPTなどのAIがそのまま読める形（Markdown/CSV）に整備した「観光AIナレッジ」。** あわせて、キャリーケースの有無で1泊2日の旅程が組み替わることを示す**実証デモWebアプリ**を提供します。

ふつうの乗換案内は「A→Bに一番早く行く方法」しか教えてくれません。本作品は「この船で着く」「荷物がある」「2日ある」という条件から、**実在するバス便だけで成立する旅程**をAIが提案できるようにするのが新しい点です。

---

## リポジトリ構成

| ディレクトリ | 役割 | 状態 |
|---|---|---|
| [`knowledge/`](knowledge/README.md) | **作品の本体**。GTFS→AI可読時刻表の変換スクリプト＋現地の暗黙知10項目＋AIへの渡し方 | ✅ 完成（時刻表の生成はGTFS承認待ち。下記参照） |
| [`app/`](app/README.md) | **実証デモ**Webアプリ。旅程はブラウザ内で確定計算、Claude APIは解説文のみ | ✅ **公開中** → https://izu-oshima-smart-tourism.kotaroshimada38.workers.dev （設計: [docs/superpowers/specs/2026-08-21-oshima-app-design.md](docs/superpowers/specs/2026-08-21-oshima-app-design.md)） |
| [`poc/`](poc/README.md) | 初期試作。提出書類・動画から参照済みのため**凍結**（壊さない） | ✅ 完成 |
| [`docs/submission/`](docs/submission/) | 提出物一式：提出文書・Jotform回答・スライド・2分動画・画面キャプチャ | ✅ ほぼ完成（デモURL記入待ち） |
| [`docs/itinerary/`](docs/itinerary/2026-08-22-23-plan.md) | 8/22–23 モデル旅程の詳細（帰りの船からの逆算つき） | ✅ |
| [`docs/team/`](docs/team/MEMBERS.md) | メンバーと役割 | ✅ |
| `docs/superpowers/` | 設計書・実装計画 | — |
| `index.html`・`docs/share/` | 8/16時点のチーム共有ノート（経緯・戦略の詳細はこちら） | 📜 アーカイブ |

---

## 実証デモアプリ（`app/`）の動かし方

**公開URL（本番）**
- https://izu-oshima-smart-tourism.kotaroshimada38.workers.dev — **main へのpushで自動デプロイ**（Cloudflare Workers Builds）
- https://oshima-smart-course.pages.dev — Pages 直アップロード版（手動デプロイ）

詳しい起動・デプロイ手順は [`app/README.md`](app/README.md) を参照。要点だけ：

### ローカルで起動する

```bash
cd app
npm install
npm test                 # planner / data / prompt / SSE のテスト（node --test）
cp .dev.vars.example .dev.vars   # ANTHROPIC_API_KEY を設定（なくてもテンプレ文で動く）
npm run dev:node         # Node製の開発サーバ → http://localhost:8788/
```

- `npm run dev:node` は静的ファイル配信と `/api/*`（Pages Functions）をNodeだけで再現する開発ハーネス（`app/scripts/dev-node.mjs`）。**macOS 12以下でも動く**（このリポジトリの検証環境）
- macOS 13.5+ / Linux なら本物のCloudflareランタイム（workerd）でも起動できる：`npm run dev`（= `wrangler pages dev`）。macOS 12以下では `Unsupported macOS version` エラーで起動しないため `dev:node` を使うこと
- **AIが失敗してもテンプレ文にフォールバック**するので、APIキーなしでもデモは成立します
- CSSを触ったら `npm run build:css`（Tailwind v4）

### Cloudflare へ公開する

**通常は何もしなくてよい**：main にマージすれば Workers Builds が自動でビルド・デプロイする（設定はリポジトリルートの [`wrangler.jsonc`](wrangler.jsonc) と [`worker/index.js`](worker/index.js)）。

手動デプロイとAPIキー設定：

```bash
npx wrangler login                        # 初回のみ（ブラウザでCloudflareにログイン）
npx wrangler deploy                       # リポジトリルートで実行 → Worker版を手動デプロイ
npx wrangler secret put ANTHROPIC_API_KEY # AI解説を有効にする場合のみ。未設定でもテンプレ文で動く

cd app                                    # （任意）Pages版もデプロイする場合
npx wrangler pages deploy public
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name oshima-smart-course
```

- `/api/explain` は Anthropic SDK（`node:` モジュール）を使うため **`nodejs_compat` フラグが必須**（ルート `wrangler.jsonc`・`app/wrangler.toml` の両方に設定済み。消すとデプロイ先で実行時エラーになる）

### GTFSデータの差し替え

- GTFS取得後は `npm run build:gtfs -- AllLines.zip --date 20260822` で `public/data/timetable.json` を差し替え（それまでは公式PDF起こしの手入力時刻表。画面に注記バナーが出ます）

> **⚠️ GTFSの現状（8/21・スキップ確定）**：ODPT開発者登録は申請済みだが承認まで2〜3営業日かかるため、**提出締切（8/23）は手入力時刻表（公式PDF起こし・出典明記）で提出する方針に確定**。変換パイプラインは合成GTFSによるテストで動作を示す。承認が下り次第、実データで `build:gtfs` / `gtfs_to_knowledge.py` を実行して差し替える。

---

## 旅程を組むときの前提（ドメイン知識の要点）

詳細は `knowledge/oshima/knowledge/`（暗黙知10項目）と [docs/itinerary/2026-08-22-23-plan.md](docs/itinerary/2026-08-22-23-plan.md)。

- **到着港は当日の海況で決まる**（元町港 or 岡田港）。前日までは確定しない
- **バスの手荷物ルール**（✅ 大島バス手荷物規定PDF）：無料は3辺合計1m以内・10kgまで。超えると1個500円、**混雑時は乗車を断られることがある** → 「荷物」が旅程を左右する根拠
- **三原山ラインは1日3往復**で、午後にホテル→山頂口へ上がる便はない → 初日に山へは行けない。1日目は荷物OKな「椿・花ガーデン」、2日目に荷物を預けて三原山
- **帰りの船から逆算する**：2日目は 13:37 三原山温泉発（港行き最終）→ 13:55 港着 → 大型客船 14:20 発（✅ 公式時刻表）
- AIには「**時刻表にない便を発明しない**」ルールを与える（プロンプト雛形は `knowledge/docs/HOW-TO-USE-WITH-CHATGPT.md`）

---

## 提出（First Stage）

- 提出文書（フォーム記入用・最終版）：[docs/submission/2026-08-23-first-stage-submission.md](docs/submission/2026-08-23-first-stage-submission.md)
- 添付：`docs/submission/slides/slides.pdf`＋画面キャプチャ3点。2分動画は収録済み（写真はWikimedia Commonsのフリー素材、クレジットは `docs/submission/assets/CREDITS.md`）
- **締切当日は余裕がないため、8/21までに提出可能な状態にする**（デモURLは公開済み：https://izu-oshima-smart-tourism.kotaroshimada38.workers.dev 。残タスク：提出文書へのURL記入 → フォーム提出）

---

## 用語ミニ辞典

| 用語 | 意味 |
|---|---|
| **GTFS / GTFS-JP** | バスの時刻表・路線・停留所をコンピュータが読める形にした共通データ形式。JPは日本版 |
| **ODPT** | 公共交通オープンデータセンター。大島バスのGTFSはここで公開（要・開発者登録） |
| **ODH** | 東京都知事杯オープンデータ・ハッカソン。都のオープンデータでサービスを作って競う大会 |
| **暗黙知** | 「港が当日決まる」など、現地に行かないと分からない事情。1トピック1ファイルで整理 |
| **PoC** | Proof of Concept。「このアイデアは本当に動くのか」を確かめるための試作 |
| **service_id** | GTFSの中で「この便はどの曜日・季節に走るか」を表すID（例：三原山＿夏＿3） |
| **Cloudflare Pages** | ウェブサイトを無料で公開できるサービス。デモアプリの公開先 |
| **一次情報** | 自分で確かめた情報。伝聞よりずっと強い |

---

## 出典

- ODH2026 ガイドブック https://odh-tokyo2026.code4japan.org/
- 大島バス GTFS-JP（ODPT） https://ckan.odpt.org/dataset/oshima_bus_all_lines
- 大島バス 路線バス時刻表 http://www.oshima-bus.com/rosen-bus.html
- 大島バス 手荷物規定 http://www.oshima-bus.com/files/tenimotsu.pdf
- 東海汽船 時刻表 https://www.tokaikisen.co.jp/boarding/timetable/
- 伊豆諸島・小笠原諸島観光客入込実態調査 https://data.tourism.metro.tokyo.lg.jp/data/tosho-irekomi/

※ 時刻・運賃・締切は2026年8月時点の調査。必ず公式サイトで最終確認してください。
