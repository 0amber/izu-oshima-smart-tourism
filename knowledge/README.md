# 伊豆大島 観光AIナレッジ（oshima-tourism-ai-knowledge）

伊豆大島の観光・移動に関する「現地の事情」と「バスの時刻」を、**ChatGPTなどのAIがそのまま読める形**（Markdown／CSV）で整理するプロジェクトです。**アプリは作りません。情報基盤の整備だけを行います。**

> 参考にした成果物イメージ：[Mitchy888/toyama-tourism-ai-knowledge](https://github.com/Mitchy888/toyama-tourism-ai-knowledge)（富山県観光の暗黙知をAI-readableに整理したプロトタイプ）

## 解決したい困りごと

- ChatGPTに伊豆大島の旅程を頼んでも、**大島バスの具体的な時刻が入った旅程が出てこない**
- 大島バスの時刻表PDFは、ChatGPTが中身を読めない
- 大島バスのGTFS（公共交通オープンデータ）はあるが、zipのままではChatGPTが読めない

→ **GTFSを正としてAIが読める表に変換し、現地の暗黙知と一緒に渡す**ことで、時刻入りの旅程提案を可能にする。

## 決まっていること（詳細は [docs/DECISIONS.md](docs/DECISIONS.md)）

1. **時刻の情報源はGTFSのみ**（ODPT 公共交通オープンデータセンター）。PDFからの手入力はしない
2. **GTFSは各自でODPTに登録して取得する**（無料、承認まで2〜3営業日）。zipは**リポジトリにコミットしない**
3. **ライセンス制約**：GTFSを加工して公開するのはOK。ただし**公開した加工物から元のGTFSを復元できてはいけない**（[docs/LICENSE-COMPLIANCE.md](docs/LICENSE-COMPLIANCE.md)）
4. 成果物は「AIに読ませるための文書」。UI・経路探索エンジン・APIは作らない

## ディレクトリ

```
knowledge/
  README.md                 このファイル
  docs/
    DECISIONS.md            決定事項の記録（なぜB案か、ライセンス、役割）
    LICENSE-COMPLIANCE.md   復元不可能性の基準とチェックリスト
    ODPT-SETUP.md           ODPT登録〜GTFS取得の手順（各自）
    HOW-TO-USE-WITH-CHATGPT.md  ChatGPTへの渡し方とプロンプト雛形
  oshima/
    knowledge/              現地の暗黙知（Markdown、1ファイル1トピック）
    timetable/              GTFSから生成する時刻表（Markdown/CSV）※生成物。手で編集しない
  scripts/
    gtfs_to_knowledge.py    GTFS zip → oshima/timetable/*.md, *.csv（標準ライブラリのみ）
    config/oshima.json      抽出対象（観光地に対応する停留所・路線）と表示名
  data/                     GTFS zip 置き場（.gitignore 済み。各自取得）
```

## 使い方（3ステップ）

1. [docs/ODPT-SETUP.md](docs/ODPT-SETUP.md) の手順でGTFS zipを取得し `knowledge/data/` に置く
2. `python3 knowledge/scripts/gtfs_to_knowledge.py knowledge/data/AllLines.zip --date 20260822`
   → `knowledge/oshima/timetable/` にMarkdown/CSVが生成される
3. [docs/HOW-TO-USE-WITH-CHATGPT.md](docs/HOW-TO-USE-WITH-CHATGPT.md) のとおり、`oshima/knowledge/*.md` と `oshima/timetable/*.md` をChatGPTに渡して旅程を頼む

## 注意

- 本ナレッジは作成日時点の情報に基づくプロトタイプです。運行・営業は変わるため、実際の旅行では各事業者の最新公式情報を必ず確認してください
- 生成した時刻表には作成日・GTFSのバージョン（有効期間）を必ず記載します

## 出典

- 大島バス GTFS-JP（公共交通オープンデータセンター）https://ckan.odpt.org/dataset/oshima_bus_all_lines
- 大島旅客自動車 公式サイト http://www.oshima-bus.com/
- 東海汽船 https://www.tokaikisen.co.jp/
