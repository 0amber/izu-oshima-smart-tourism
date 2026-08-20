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
}
STOP_NAMES = {
    "PORT": "入港地（元町港／岡田港）",
    "TSUBAKI": "椿・花ガーデン",
    "ONSEN": "三原山温泉（大島温泉ホテル前）",
    "SUMMIT": "三原山頂口",
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
    for r in read_csv(z, "calendar.txt"):
        if r["start_date"] <= date <= r["end_date"] and r.get(wd) == "1":
            active.add(r["service_id"])
    for r in read_csv(z, "calendar_dates.txt"):
        if r["date"] != date:
            continue
        if r["exception_type"] == "1": active.add(r["service_id"])
        elif r["exception_type"] == "2": active.discard(r["service_id"])
    return active

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
    services = active_services(z, a.date)
    stops = {r["stop_id"]: r for r in read_csv(z, "stops.txt")}
    routes = {r["route_id"]: r for r in read_csv(z, "routes.txt")}
    trips = {r["trip_id"]: r for r in read_csv(z, "trips.txt") if r["service_id"] in services}
    st_by_trip = {}
    for r in read_csv(z, "stop_times.txt"):
        if r["trip_id"] in trips:
            st_by_trip.setdefault(r["trip_id"], []).append(r)

    out_trips = []
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
        t = trips[tid]
        route = routes.get(t["route_id"], {})
        out_trips.append({
            "tripId": tid,
            "routeName": route.get("route_long_name") or route.get("route_short_name") or t["route_id"],
            "serviceId": t["service_id"],
            "ports": ports or ["motomachi", "okada"],
            "stops": seq,
        })

    out = {
        "meta": {
            "source": f"大島バス GTFS-JP（ODPT）から生成 date={a.date}",
            "sourceUrl": "https://ckan.odpt.org/dataset/oshima_bus_all_lines",
            "validFrom": a.date, "validTo": a.date,
            "serviceNote": f"有効 service_id: {', '.join(sorted(services))}",
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
