#!/usr/bin/env python3
"""
GTFS-JP zip（大島バス）→ public/data/timetable.json 変換スクリプト（標準ライブラリのみ）

使い方:
  python3 scripts/build_gtfs.py path/to/AllLines.zip --date 20260822 [--out public/data/timetable.json]

入手先: 公共交通オープンデータセンター（要開発者登録・トークン）
  https://ckan.odpt.org/dataset/oshima_bus_all_lines
  https://api.odpt.org/api/v4/files/odpt/OshimaBus/AllLines.zip?date=20260701&acl:consumerKey=<TOKEN>

やること:
  1. calendar.txt / calendar_dates.txt から --date に有効な service_id を解決
  2. STOP_MAP に載っている停留所名（部分一致）を含む trip だけ抽出
  3. アプリが読む形式 {meta, stops, fares, trips:[{tripId, routeName, serviceId, ports, stops:[{stopId, arr, dep}]}]} で出力

注意:
  - 港（元町/岡田）は GTFS 上は別停留所。ここでは両方を抽象停留所 "PORT" にまとめ、trip.ports に実港を記録する。
  - 運賃は fare_rules があれば拾う。無ければ既存 timetable.json の fares を引き継ぐ。
  - 実データの停留所名は取得後に STOP_MAP を調整すること（未検証）。
"""
import argparse, csv, io, json, sys, zipfile, datetime as dt
from pathlib import Path

# アプリの stopId ← GTFS停留所名（部分一致キーワード）。取得後に要調整。
STOP_MAP = {
    "PORT_MOTOMACHI": ["元町港"],
    "PORT_OKADA": ["岡田港"],
    "TSUBAKI": ["椿・花ガーデン", "椿花ガーデン"],
    "ONSEN": ["三原山温泉"],
    "SUMMIT": ["三原山頂口", "三原山山頂口"],
    "PARK": ["大島公園"],
    "HABU": ["波浮港"],
}
STOP_NAMES = {
    "PORT": {"name": "入港地（元町港／岡田港）", "note": "当日の海況で決まる"},
    "TSUBAKI": {"name": "椿・花ガーデン"},
    "ONSEN": {"name": "三原山温泉（大島温泉ホテル前）"},
    "SUMMIT": {"name": "三原山頂口"},
    "PARK": {"name": "大島公園"},
    "HABU": {"name": "波浮港"},
}

def read_csv(z, name):
    if name not in z.namelist():
        return []
    with z.open(name) as f:
        text = io.TextIOWrapper(f, encoding="utf-8-sig")
        return list(csv.DictReader(text))

def active_services(z, date):
    d = dt.datetime.strptime(date, "%Y%m%d").date()
    wd = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"][d.weekday()]
    active = set()
    valid_to = date
    for r in read_csv(z, "calendar.txt"):
        if r["start_date"] <= date <= r["end_date"] and r.get(wd) == "1":
            active.add(r["service_id"])
            valid_to = max(valid_to, r["end_date"])
    for r in read_csv(z, "calendar_dates.txt"):
        if r["date"] != date:
            continue
        if r["exception_type"] == "1": active.add(r["service_id"])
        elif r["exception_type"] == "2": active.discard(r["service_id"])
    return active, valid_to

# ライセンス配慮: GTFSの trip_id / service_id は出力しない(復元不可能な要約にする)。
# 便IDは 路線プレフィックス+方向+発時刻 で合成、運行日は粗い区分ラベルに変換する。
ROUTE_PREFIX = [("三原山", "MIHARA"), ("大島公園", "PARK"), ("波浮", "HABU"), ("野田浜", "NODAHAMA")]
def synth_trip_id(route_name, first_stop, last_stop, dep, used):
    key = next((p for kw, p in ROUTE_PREFIX if kw in route_name), "BUS")
    updown = "UP" if first_stop == "PORT" else ("DOWN" if last_stop == "PORT" else "MID")
    base = f"{key}_{updown}_{dep.replace(':', '')}"
    tid, n = base, 2
    while tid in used:
        tid = f"{base}_{n}"; n += 1
    used.add(tid)
    return tid

def service_label(sid):
    for kw, label in [("全日", "全日運行"), ("土休日", "土休日運行"), ("平日", "平日運行"), ("夏", "夏ダイヤ")]:
        if kw in sid:
            return label
    return "運行日は公式で確認"

def map_stop(stop_name):
    for sid, kws in STOP_MAP.items():
        if any(k in stop_name for k in kws):
            return sid
    return None

def hhmm(t):
    h, m, *_ = t.split(":")
    return f"{int(h):02d}:{int(m):02d}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("zip")
    ap.add_argument("--date", required=True, help="YYYYMMDD 例: 20260822")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "public/data/timetable.json"))
    a = ap.parse_args()

    out_path = Path(a.out)
    prev = json.loads(out_path.read_text()) if out_path.exists() else {}

    z = zipfile.ZipFile(a.zip)
    services, valid_to = active_services(z, a.date)
    stops = {r["stop_id"]: r for r in read_csv(z, "stops.txt")}
    routes = {r["route_id"]: r for r in read_csv(z, "routes.txt")}
    trips = {r["trip_id"]: r for r in read_csv(z, "trips.txt") if r["service_id"] in services}
    st_by_trip = {}
    for r in read_csv(z, "stop_times.txt"):
        if r["trip_id"] in trips:
            st_by_trip.setdefault(r["trip_id"], []).append(r)

    iso = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:]}"
    out_trips = []
    used_ids = set()
    rows = []
    for tid, sts in st_by_trip.items():
        sts.sort(key=lambda r: int(r["stop_sequence"]))
        seq, ports = [], []
        for r in sts:
            sid = map_stop(stops[r["stop_id"]]["stop_name"])
            if not sid:
                continue
            if sid.startswith("PORT_"):
                ports.append("motomachi" if sid == "PORT_MOTOMACHI" else "okada")
                sid = "PORT"
            seq.append({"stopId": sid, "arr": hhmm(r["arrival_time"]), "dep": hhmm(r["departure_time"])})
        if len(seq) < 2:
            continue
        rows.append((tid, seq, ports))
    # 便IDの合成を発時刻順で安定させる
    rows.sort(key=lambda x: (x[1][0]["dep"], x[0]))
    for tid, seq, ports in rows:
        t = trips[tid]
        route = routes.get(t["route_id"], {})
        route_name = route.get("route_long_name") or route.get("route_short_name") or "路線バス"
        out_trips.append({
            "tripId": synth_trip_id(route_name, seq[0]["stopId"], seq[-1]["stopId"], seq[0]["dep"], used_ids),
            "routeName": route_name,
            "serviceId": service_label(t["service_id"]),
            "ports": ports or ["motomachi", "okada"],
            "stops": seq,
        })

    out = {
        "meta": {
            "source": f"大島バス GTFS-JP（公共交通オープンデータセンター）より生成。観光に必要な停留所のみの要約（識別子・座標は含まない）",
            "sourceUrl": "https://ckan.odpt.org/dataset/oshima_bus_all_lines",
            "validFrom": iso(a.date), "validTo": iso(valid_to),
            "serviceNote": f"対象日 {iso(a.date)} に有効な便のみ収録。運行日・季節ダイヤは公式で要確認",
            "generatedBy": "scripts/build_gtfs.py",
        },
        "stops": STOP_NAMES,
        "fares": prev.get("fares", {}),
        "trips": sorted(out_trips, key=lambda t: t["stops"][0]["dep"]),
    }
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"wrote {out_path} trips={len(out_trips)} services={sorted(services)}", file=sys.stderr)

if __name__ == "__main__":
    main()
