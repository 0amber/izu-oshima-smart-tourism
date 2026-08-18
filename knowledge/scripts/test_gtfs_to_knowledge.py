#!/usr/bin/env python3
"""合成GTFS（実データ不要）で変換と復元不可能性チェックを検証する。  python3 knowledge/scripts/test_gtfs_to_knowledge.py"""
import io, json, subprocess, sys, tempfile, zipfile
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gtfs_to_knowledge as g

def make_gtfs(path):
    files = {
        "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\nA,大島旅客自動車,http://x,Asia/Tokyo\n",
        "stops.txt": ("stop_id,stop_name,stop_lat,stop_lon,zone_id\n"
                      "S1,元町港,34.7500,139.3550,Z1\nS2,椿・花ガーデン,34.7400,139.3700,Z2\n"
                      "S3,椿の森公園,34.7350,139.3800,Z3\nS4,三原山温泉,34.7300,139.3900,Z4\n"
                      "S5,三原山頂口,34.7250,139.4000,Z5\nS6,岡田港,34.7800,139.3900,Z1\n"),
        "routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_type\nR1,A,,三原山ライン,3\n",
        "calendar.txt": ("service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                         "SV_ALL,1,1,1,1,1,1,1,20260701,20260930\nSV_WKND,0,0,0,0,0,1,1,20260701,20260930\n"),
        "calendar_dates.txt": "service_id,date,exception_type\nSV_WKND,20260822,2\n",
        "trips.txt": ("route_id,service_id,trip_id,trip_headsign,direction_id\n"
                      "R1,SV_ALL,T1,三原山頂口,0\nR1,SV_ALL,T2,元町港,1\nR1,SV_WKND,T3,三原山頂口,0\n"),
        "stop_times.txt": ("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                           "T1,10:20:00,10:20:00,S1,1\nT1,10:28:00,10:28:00,S2,2\nT1,10:31:00,10:31:00,S3,3\nT1,10:38:00,10:38:00,S4,4\nT1,10:45:00,10:45:00,S5,5\n"
                           "T2,13:30:00,13:30:00,S5,1\nT2,13:37:00,13:37:00,S4,2\nT2,13:47:00,13:47:00,S2,3\nT2,13:55:00,13:55:00,S1,4\n"
                           "T3,15:00:00,15:00:00,S1,1\nT3,15:25:00,15:25:00,S5,2\n"),
        "fare_attributes.txt": "fare_id,price,currency_type,payment_method,transfers\nF1,300,JPY,1,0\nF2,1090,JPY,1,0\n",
        "fare_rules.txt": "fare_id,route_id,origin_id,destination_id\nF1,,Z1,Z2\nF2,,Z1,Z5\n",
        "feed_info.txt": "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date\nODPT,http://x,ja,20260701,20260930\n",
    }
    with zipfile.ZipFile(path, "w") as z:
        for k, v in files.items():
            z.writestr(k, v)

def main():
    with tempfile.TemporaryDirectory() as d:
        zp = Path(d) / "gtfs.zip"; make_gtfs(zp)
        out = Path(d) / "out"
        cfg = g.load_config(HERE / "config/oshima.json")
        tables = g.convert(str(zp), "20260822", cfg, str(out))
        md = (out / "oshima-bus-timetable.md").read_text(encoding="utf-8")
        csvt = (out / "oshima-bus-timetable.csv").read_text(encoding="utf-8")
        # 1) 選抜停留所の時刻が出る
        assert "10:20" in md and "10:28" in md and "13:55" in md, md
        # 2) 選抜外（椿の森公園）は出ない、途中時刻 10:31 も出ない
        assert "椿の森公園" not in md and "10:31" not in md
        # 3) 対象日に運休の便（土日サービスの 8/22 運休）は出ない
        assert "15:25" not in md
        # 4) 識別子が出ない
        for bad in ["S1", "T1", "R1", "SV_ALL", "stop_id", "trip_id"]:
            assert bad not in md and bad not in csvt, bad
        # 5) 運賃が引ける
        assert "元町港 〜 椿・花ガーデン | 300円" in md and "1090円" in md
        # 6) 運行日区分は文章
        assert "毎日（2026/7/1〜2026/9/30）" in md
        # 7) コンプライアンスチェッカーが通る
        r = subprocess.run([sys.executable, str(HERE / "check_compliance.py"), "--dir", str(out)], capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        print("ALL OK\n--- sample ---\n" + md[:1200])

if __name__ == "__main__":
    main()
