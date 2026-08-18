# ODPT登録 〜 大島バスGTFS取得（各自で行う）

チーム決定 D-3：**メンバー全員が自分で取得**します。無料。承認まで2〜3営業日（清水さん実績）。今週中に申請を。

## 1. 開発者登録
1. 公共交通オープンデータセンター https://www.odpt.org/ → 「開発者登録」（Developer Registration）
2. 氏名・メール・利用目的（例：「都知事杯オープンデータ・ハッカソン2026 伊豆大島観光の旅程提案ナレッジ作成」）を記入して申請
3. 承認メールが届いたら、開発者サイトにログインし **アクセストークン（consumerKey）** を控える

## 2. 大島バスGTFSを取得
- データセットページ：https://ckan.odpt.org/dataset/oshima_bus_all_lines
- 最新版（例：「大島バス-20260701」有効 2026/7/1〜9/30）のリソースURLは次の形式：
  ```
  https://api.odpt.org/api/v4/files/odpt/OshimaBus/AllLines.zip?date=20260701&acl:consumerKey=<自分のトークン>
  ```
- ブラウザで開くか、ターミナルで：
  ```bash
  curl -L -o knowledge/data/AllLines.zip \
    "https://api.odpt.org/api/v4/files/odpt/OshimaBus/AllLines.zip?date=20260701&acl:consumerKey=＜トークン＞"
  ```
- トークン無しでは403になります（確認済み）。**トークンをチャットやリポジトリに貼らない**こと

## 3. 置き場所と禁止事項
- `knowledge/data/AllLines.zip` に置く（`.gitignore` 済み。**コミットしない**）
- 解凍したtxtもコミットしない
- 個人のトークンは共有しない（各自の登録が前提）

## 4. 変換して確認
```bash
python3 knowledge/scripts/gtfs_to_knowledge.py knowledge/data/AllLines.zip --date 20260822
python3 knowledge/scripts/check_compliance.py       # 復元不可能性の機械チェック
```
生成物：`knowledge/oshima/timetable/*.md`, `*.csv`

## 参考
- ODPT データセット一覧の大島バス：年4回改定（7/1, 10/1, 1/1, 4/1 目安）。ダイヤ改定時は `--date` と URL の `date=` を新版に合わせて再生成
- ライセンス表示・利用規約は各自でデータセットページから確認（[LICENSE-COMPLIANCE.md](LICENSE-COMPLIANCE.md)）
