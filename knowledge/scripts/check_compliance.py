#!/usr/bin/env python3
"""
公開前チェック：生成物に GTFS の識別子・座標・GTFS同等の列名が含まれていないか、
選抜停留所以外の名前が混ざっていないかを機械的に確認する。

使い方: python3 knowledge/scripts/check_compliance.py [--dir knowledge/oshima/timetable] [--config ...]
終了コード 0=OK, 1=NG
"""
import argparse, csv, json, re, sys
from pathlib import Path

FORBIDDEN = [r"\bstop_id\b", r"\btrip_id\b", r"\broute_id\b", r"\bservice_id\b", r"\bshape_id\b",
             r"\bstop_sequence\b", r"\barrival_time\b", r"\bdeparture_time\b", r"\bstop_lat\b", r"\bstop_lon\b",
             r"\b\d{2}\.\d{4,},\s*\d{3}\.\d{4,}\b"]  # 緯度,経度っぽい数字

def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(here.parent / "oshima/timetable"))
    ap.add_argument("--config", default=str(here / "config/oshima.json"))
    a = ap.parse_args()
    cfg = json.loads(Path(a.config).read_text(encoding="utf-8"))
    allowed = {s["name"] for s in cfg["stops"]}
    ng = []
    files = list(Path(a.dir).glob("*.md")) + list(Path(a.dir).glob("*.csv"))
    if not files:
        print("生成物がありません:", a.dir); sys.exit(1)
    for p in files:
        text = p.read_text(encoding="utf-8")
        for pat in FORBIDDEN:
            if re.search(pat, text):
                ng.append(f"{p.name}: 禁止パターン {pat}")
        if "生成日" not in text and p.suffix == ".md":
            ng.append(f"{p.name}: 生成日の注記がない")
        if p.suffix == ".csv":
            with p.open(encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    if row["停留所"] not in allowed:
                        ng.append(f"{p.name}: 選抜外の停留所 {row['停留所']}"); break
    if ng:
        print("NG:\n  " + "\n  ".join(ng)); sys.exit(1)
    print(f"OK: {len(files)} files checked (識別子・座標なし、停留所は選抜リスト内、注記あり)")

if __name__ == "__main__":
    main()
