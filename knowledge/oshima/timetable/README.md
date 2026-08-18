# timetable/（生成物）

ここには `scripts/gtfs_to_knowledge.py` が生成した `oshima-bus-timetable.md` / `.csv` を置きます。**手で編集しない**でください（GTFS更新時に再生成で上書きします）。

まだ生成されていない場合：各自で ODPT からGTFS zipを取得し（`docs/ODPT-SETUP.md`）、
```
python3 knowledge/scripts/gtfs_to_knowledge.py knowledge/data/AllLines.zip --date 20260822
python3 knowledge/scripts/check_compliance.py
```
を実行してください。公開前チェックは `docs/LICENSE-COMPLIANCE.md`。
