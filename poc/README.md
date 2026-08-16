# 大島スマートコース PoC v0.1

「キャリーケースあり ⇄ 身軽」を切り替えると、GTFS（バス時刻表）に基づいて1泊2日の旅程が組み替わるたたき台。

## 動かす

```bash
cd poc
npm test          # ロジックのテスト（node --test）
npm run dev       # http://localhost:8788 で起動（python3 の簡易サーバ）
```

Cloudflare Pages に置く場合は `public/` をそのままデプロイ（ビルド不要）。

## 構成

```
public/
  index.html        画面（入力 → タイムライン → スポット詳細モーダル）
  style.css
  js/planner.js     純粋関数：nextBus / planTrip / explain（ブラウザとNode共通）
  js/app.js         DOM描画・イベント
  data/timetable.json  時刻表（いまは公式PDF由来の手入力。ODPT GTFS取得後に差し替え）
  data/spots.json      スポット表（荷物適性 luggageScore、滞在目安、注意、現地TODO）
scripts/build_gtfs.py  GTFS-JP zip → timetable.json 変換（標準ライブラリのみ）
test/planner.test.mjs  ロジックのテスト
```

## いまの分岐ロジック（planner.js）

- **荷物あり**：港 → 椿・花ガーデン（2h+滞在）→ 三原山温泉（ホテル）。午後にホテル→山頂へ上がる便があれば「第2案」を提案（現行ダイヤでは該当便なし）
- **身軽**：港 → 三原山頂口 直行（2.5h）→ ホテル
- **2日目**：ホテルで荷物預け → 山頂口 → 港
- すべてのバス便は `timetable.json` の trip に紐づく（＝時刻表と一致 ✅）。見つからなければ ⛔ で明示

## 検証でわかったこと

- 「12:58ホテル着 → 13:30便で山頂へ」は**不成立**（13:30は山頂口発の下り便）。荷物あり初日の午後は温泉・周辺散策が現実的
- 岡田港入港時、12:40便（元町港発）は使えない → 12:48便が消えるので、**岡田港発の午後便を要確認**
- 港未定モードでは両港共通便のみで組む（10:20便・下り便）

## 次にやること

1. ODPT開発者登録 → `python3 scripts/build_gtfs.py AllLines.zip --date 20260822` で本物のGTFSに差し替え（STOP_MAPの停留所名を実データに合わせる）
2. 岡田港発ダイヤの追加、下り便の途中停留所時刻の確定
3. `explain()` を Pages Function（LLM）に差し替え（失敗時はテンプレにフォールバック）
4. 現地検証（8/22-23）の結果を `spots.json` の cautions/todo に反映
