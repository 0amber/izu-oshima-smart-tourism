#!/bin/sh
# ODPTの実GTFSを取得して public/data/timetable.json を差し替える(Task 12)。
#
# 使い方(app/ で実行):
#   ODPT_TOKEN=<アクセストークン> npm run gtfs:update            # 対象日デフォルト 20260822
#   ODPT_TOKEN=<アクセストークン> npm run gtfs:update -- 20260901 # 対象日を指定
#
# トークンは https://developer.odpt.org/ にログインして「アクセストークン」を控える。
# zipはコミットしない(.gitignoreの *.zip 対象)。差し替え後にテストが落ちたら、
# 「時刻表の正が変わった」ものとして test 側の期待時刻を実データに合わせて更新すること。
set -eu
: "${ODPT_TOKEN:?ODPT_TOKEN(アクセストークン)を環境変数で指定してください → https://developer.odpt.org/}"
DATE="${1:-20260822}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

URL="https://api.odpt.org/api/v4/files/odpt/OshimaBus/AllLines.zip?date=20260701&acl:consumerKey=${ODPT_TOKEN}"
echo "downloading AllLines.zip from ODPT..." >&2
curl -fsSL "$URL" -o "$TMP/AllLines.zip"
python3 "$(dirname "$0")/build_gtfs.py" "$TMP/AllLines.zip" --date "$DATE"
echo "running tests..." >&2
npm test
echo "done: public/data/timetable.json を実GTFSで再生成しました(対象日 $DATE)" >&2
