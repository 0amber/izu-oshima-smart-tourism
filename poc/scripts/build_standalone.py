#!/usr/bin/env python3
"""
public/ の index.html + style.css + js/*.js + data/*.json を 1 ファイルに埋め込み、
ダブルクリック（file://）でも動く配布用 HTML を dist/oshima-smart-course.html に生成する。

使い方: python3 scripts/build_standalone.py
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "public"
OUT = ROOT / "dist" / "oshima-smart-course.html"

html = (PUB / "index.html").read_text(encoding="utf-8")
css = (PUB / "style.css").read_text(encoding="utf-8")
planner = (PUB / "js/planner.js").read_text(encoding="utf-8")
app = (PUB / "js/app.js").read_text(encoding="utf-8")
tt = json.dumps(json.loads((PUB / "data/timetable.json").read_text(encoding="utf-8")), ensure_ascii=False)
spots = json.dumps(json.loads((PUB / "data/spots.json").read_text(encoding="utf-8")), ensure_ascii=False)

# ES module 構文を素の <script> 用に変換
planner = re.sub(r"^export\s+", "", planner, flags=re.M)
app = re.sub(r'^import\s+\{[^}]*\}\s+from\s+"\./planner\.js";\s*$', "", app, flags=re.M)
# fetch を埋め込みデータに置換
app = re.sub(
    r"\[tt, spots\] = await Promise\.all\(\[\s*fetch\(\"data/timetable\.json\"\)\.then\(\(r\) => r\.json\(\)\),\s*fetch\(\"data/spots\.json\"\)\.then\(\(r\) => r\.json\(\)\),\s*\]\);",
    "[tt, spots] = [window.__TIMETABLE__, window.__SPOTS__];",
    app,
)
assert "fetch(" not in app, "fetch の置換に失敗しました（app.js の load() を確認）"
assert "import " not in app and "export " not in planner

html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
html = html.replace(
    '<script type="module" src="js/app.js"></script>',
    "<script>\nwindow.__TIMETABLE__ = " + tt + ";\nwindow.__SPOTS__ = " + spots + ";\n</script>\n"
    "<script>\n" + planner + "\n</script>\n"
    "<script>\n" + app + "\n</script>",
)
assert 'src="js/app.js"' not in html and 'href="style.css"' not in html

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)
