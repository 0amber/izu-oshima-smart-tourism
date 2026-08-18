#!/usr/bin/env python3
"""
GTFS-JP zip（大島バス）→ AIが読める時刻表（Markdown / CSV）を生成する。標準ライブラリのみ。

使い方:
  python3 knowledge/scripts/gtfs_to_knowledge.py knowledge/data/AllLines.zip --date 20260822
  オプション: --config knowledge/scripts/config/oshima.json  --out knowledge/oshima/timetable

設計上の約束（docs/LICENSE-COMPLIANCE.md）
  - config の選抜停留所だけを出力する（他の停留所・途中時刻は出さない）
  - stop_id / trip_id / route_id / service_id / shape_id / 座標 は出力しない
  - カレンダーは「運行日区分」の文章に変換する
  - CSV の列名は GTFS と同じにしない
"""
import argparse, csv, io, json, sys, zipfile, datetime as dt
from collections import defaultdict
from pathlib import Path

WD = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WD_JA = "月火水木金土日"

def read_csv(z, name):
    if name not in z.namelist():
        return []
    with z.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))

def hhmm(t):
    if not t:
        return ""
    h, m, *_ = t.split(":")
    return f"{int(h):02d}:{int(m):02d}"

def service_labels(z, date):
    """date に運行する service_id の集合と、service_id → 運行日区分の説明文（IDは出力しない）"""
    d = dt.datetime.strptime(date, "%Y%m%d").date()
    wd = WD[d.weekday()]
    active, label = set(), {}
    cal = read_csv(z, "calendar.txt")
    for r in cal:
        days = [WD_JA[i] for i, k in enumerate(WD) if r.get(k) == "1"]
        rng = f"{r['start_date'][:4]}/{int(r['start_date'][4:6])}/{int(r['start_date'][6:])}〜{r['end_date'][:4]}/{int(r['end_date'][4:6])}/{int(r['end_date'][6:])}"
        if len(days) == 7: dtxt = "毎日"
        elif days == list("月火水木金"): dtxt = "平日"
        elif days == ["土", "日"]: dtxt = "土日"
        elif not days: dtxt = "特定日のみ"
        else: dtxt = "・".join(days)
        label[r["service_id"]] = f"{dtxt}（{rng}）"
        if r["start_date"] <= date <= r["end_date"] and r.get(wd) == "1":
            active.add(r["service_id"])
    extra = defaultdict(list)
    for r in read_csv(z, "calendar_dates.txt"):
        if r["date"] == date:
            if r["exception_type"] == "1": active.add(r["service_id"])
            elif r["exception_type"] == "2": active.discard(r["service_id"])
        extra[r["service_id"]].append(r)
    for sid, rows in extra.items():
        add = sum(1 for r in rows if r["exception_type"] == "1")
        rem = sum(1 for r in rows if r["exception_type"] == "2")
        base = label.get(sid, "特定日運行")
        note = []
        if add: note.append(f"追加運行日{add}日あり")
        if rem: note.append(f"運休日{rem}日あり")
        label[sid] = base + ("（" + "・".join(note) + "）" if note else "")
    return active, label

def load_config(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def build_stop_map(stops, cfg):
    """stop_id → 選抜停留所の表示名（該当しなければ None）"""
    m = {}
    for sid, r in stops.items():
        for s in cfg["stops"]:
            if any(k in r["stop_name"] for k in s["match"]):
                m[sid] = s["name"]
                break
    return m

def convert(zip_path, date, cfg, out_dir):
    z = zipfile.ZipFile(zip_path)
    active, slabel = service_labels(z, date)
    stops = {r["stop_id"]: r for r in read_csv(z, "stops.txt")}
    routes = {r["route_id"]: r for r in read_csv(z, "routes.txt")}
    trips = {r["trip_id"]: r for r in read_csv(z, "trips.txt") if r["service_id"] in active}
    sel = build_stop_map(stops, cfg)
    st = defaultdict(list)
    for r in read_csv(z, "stop_times.txt"):
        if r["trip_id"] in trips:
            st[r["trip_id"]].append(r)

    # 便ごとに「選抜停留所での時刻」だけを抜く
    tables = defaultdict(list)  # (route_name, direction_key) -> rows
    for tid, rows in st.items():
        rows.sort(key=lambda r: int(r["stop_sequence"]))
        seq = []
        for r in rows:
            name = sel.get(r["stop_id"])
            if name:
                seq.append((name, hhmm(r.get("arrival_time")), hhmm(r.get("departure_time"))))
        # 同じ選抜停留所が連続する場合は先頭だけ
        dedup = []
        for x in seq:
            if not dedup or dedup[-1][0] != x[0]:
                dedup.append(x)
        if len(dedup) < 2:
            continue
        t = trips[tid]
        route = routes.get(t["route_id"], {})
        rname = route.get("route_long_name") or route.get("route_short_name") or "路線"
        dkey = tuple(x[0] for x in dedup)
        tables[(rname, dkey)].append({"stops": dedup, "service": slabel.get(t["service_id"], "運行日区分不明")})

    # 方向キーの正規化：同じ路線で停留所集合が同じなら、より長い並びに統合
    merged = defaultdict(list)
    for (rname, dkey), rows in tables.items():
        merged[(rname, " → ".join(dkey))].extend(rows)

    # 運賃（fare_rules があれば）
    fares = fare_lookup(z, stops, sel, cfg)

    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    meta = z.namelist()
    fi = read_csv(z, "feed_info.txt")
    feed = fi[0] if fi else {}
    valid = f"{feed.get('feed_start_date','?')}〜{feed.get('feed_end_date','?')}" if feed else "GTFS参照"
    today = dt.date.today().isoformat()
    header = (f"> 生成日 {today} ／ 対象日 {date[:4]}-{date[4:6]}-{date[6:]} に運行する便のみ ／ GTFS有効期間 {valid} ／ "
              f"出典：大島旅客自動車 GTFS-JP（公共交通オープンデータセンター）を加工。観光に関係する停留所だけを抜粋した要約であり、全停留所・全便ではありません。"
              f"実際の乗車前に公式時刻表で必ず確認してください。\n")

    # Markdown（路線・方向ごと）
    md = [f"# 大島バス 時刻表（観光向け抜粋）— {date[:4]}/{int(date[4:6])}/{int(date[6:])}\n", header,
          "\n## 読み方\n- 表の列は観光に関係する停留所だけ。「−」はその便が通らない／時刻なし。\n- 「運行日区分」は毎日／土日 などの文章。対象日に運行する便だけを載せています。\n"]
    csv_rows = []
    for (rname, dir_label), rows in sorted(merged.items()):
        cols = []
        for r in rows:
            for name, _, _ in r["stops"]:
                if name not in cols: cols.append(name)
        # 並び順は最初に出現した順を尊重（上り/下りで別表になる）
        rows.sort(key=lambda r: r["stops"][0][2] or r["stops"][0][1])
        md.append(f"\n## {rname}｜{dir_label}\n")
        md.append("| 便 | " + " | ".join(cols) + " | 運行日区分 |")
        md.append("|" + "---|" * (len(cols) + 2))
        for i, r in enumerate(rows, 1):
            d = {name: (dep or arr) for name, arr, dep in r["stops"]}
            md.append(f"| {i} | " + " | ".join(d.get(c, "−") for c in cols) + f" | {r['service']} |")
            for name, arr, dep in r["stops"]:
                csv_rows.append([rname, dir_label, i, name, arr, dep, r["service"]])
    if fares:
        md.append("\n## 主な運賃（大人・片道）\n| 区間 | 運賃 |\n|---|---|")
        for (a, b), yen in fares:
            md.append(f"| {a} 〜 {b} | {yen}円 |")
    else:
        md.append("\n## 主な運賃\nGTFSに運賃情報がないため未掲載。公式サイトを参照。")
    md.append("\n## 注意事項\n" + "\n".join(f"- {n}" for n in cfg.get("notes", [])))
    md.append("\n## 観光地と停留所の対応\n| 停留所 | 行ける場所 |\n|---|---|")
    for s in cfg["stops"]:
        md.append(f"| {s['name']} | {'、'.join(s['spots'])} |")
    (out / "oshima-bus-timetable.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    with (out / "oshima-bus-timetable.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["路線", "方向", "便番号", "停留所", "着", "発", "運行日区分"])
        w.writerows(csv_rows)

    print(f"wrote {out/'oshima-bus-timetable.md'} / .csv  tables={len(merged)} rows={len(csv_rows)}", file=sys.stderr)
    return merged

def fare_lookup(z, stops, sel, cfg):
    """fare_rules（origin_id/destination_id = zone_id）から config の運賃ペアを引く。無ければ空"""
    attrs = {r["fare_id"]: r for r in read_csv(z, "fare_attributes.txt")}
    rules = read_csv(z, "fare_rules.txt")
    if not attrs or not rules:
        return []
    zone_of = defaultdict(set)
    for sid, name in sel.items():
        zid = stops[sid].get("zone_id")
        if zid: zone_of[name].add(zid)
    out = []
    for a, b in cfg.get("fare_pairs", []):
        found = None
        for r in rules:
            if (r.get("origin_id") in zone_of.get(a, ()) and r.get("destination_id") in zone_of.get(b, ())) or \
               (r.get("origin_id") in zone_of.get(b, ()) and r.get("destination_id") in zone_of.get(a, ())):
                found = attrs.get(r["fare_id"], {}).get("price"); break
        if found is not None:
            try: found = int(float(found))
            except ValueError: pass
            out.append(((a, b), found))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("zip")
    ap.add_argument("--date", required=True, help="YYYYMMDD")
    here = Path(__file__).resolve().parent
    ap.add_argument("--config", default=str(here / "config/oshima.json"))
    ap.add_argument("--out", default=str(here.parent / "oshima/timetable"))
    a = ap.parse_args()
    convert(a.zip, a.date, load_config(a.config), a.out)

if __name__ == "__main__":
    main()
