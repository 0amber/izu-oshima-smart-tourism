#!/usr/bin/env python3
"""
2分プロモーションビデオを Playwright の画面録画で生成する（無音）。
  タイムライン：スライド1-3 → PoC実演（荷物あり⇄身軽・2日目・詳細）→ スライド5-8
  出力：docs/submission/video/promo-2min.webm / promo-2min.mp4（ffmpegはPlaywright同梱を使用）
  実行：/Users/shimadakoutaro/shoken/.venv/bin/python docs/submission/video/record_promo.py
"""
import glob, os, shutil, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
SL = ROOT / "docs/submission/slides/png"
POC = ROOT / "poc/dist/oshima-smart-course.html"
OUT = Path(__file__).resolve().parent
W, H = 1280, 720

# (種別, 対象, 秒, キャプション)
TIMELINE = [
    ("slide", 1, 8,  None),
    ("slide", 2, 16, None),
    ("slide", 3, 12, None),
    ("poc",   None, 40, None),   # 実演 40秒（内訳は run_poc）
    ("slide", 5, 14, None),
    ("slide", 6, 12, None),
    ("slide", 7, 10, None),
    ("slide", 8, 8,  None),
]  # 合計 120 秒

CAPTION_CSS = """
#cap{position:fixed;left:0;right:0;bottom:0;background:rgba(8,60,112,.92);color:#fff;font:700 26px/1.4 -apple-system,"Hiragino Sans",sans-serif;padding:14px 28px;z-index:9999;transition:opacity .3s}
"""

def show_slide(page, n, secs):
    page.goto(f"file://{SL}/slide{n:02d}.png")
    page.evaluate("document.body.style.margin='0';document.body.style.background='#000';const i=document.querySelector('img');if(i){i.style.width='100vw';i.style.height='100vh';i.style.objectFit='contain';}")
    time.sleep(secs)

def caption(page, text):
    page.evaluate("""t=>{let c=document.getElementById('cap');if(!c){c=document.createElement('div');c.id='cap';document.body.appendChild(c);
      const s=document.createElement('style');s.textContent=%r;document.head.appendChild(s);}c.textContent=t;}""" % CAPTION_CSS, text)

def run_poc(page):
    page.goto(f"file://{POC}"); page.wait_for_selector("#timeline .card"); time.sleep(0.5)
    caption(page, "実演：港・到着時刻・荷物の有無を選ぶだけ。バス便はすべてGTFSの実在便（✅時刻表と一致）"); time.sleep(6)
    page.evaluate("document.getElementById('planPanel').scrollIntoView({behavior:'smooth'})"); time.sleep(4)
    caption(page, "🧳 荷物あり：10:20港発 → 10:28 椿・花ガーデン → 12:48便でホテルへ。三原山には行かない"); time.sleep(6)
    page.click("#lugOff"); time.sleep(0.4); page.evaluate("document.getElementById('timeline').scrollIntoView({behavior:'smooth',block:'start'})"); time.sleep(0.6)
    caption(page, "🎒 身軽に切り替えると… 10:20港発 → 10:45 三原山頂口へ直行。旅程が組み替わる"); time.sleep(7)
    page.click("#lugOn"); time.sleep(0.4)
    page.click("#dayTabs .tab:nth-child(2)"); time.sleep(0.4); page.evaluate("document.getElementById('timeline').scrollIntoView({behavior:'smooth',block:'start'})"); time.sleep(0.6)
    caption(page, "2日目：荷物を預けて08:38山頂へ → 11:20下山・荷物回収 → 13:37最終便で港 → 14:20大型客船"); time.sleep(8)
    page.click('#timeline .card.spot[data-spot="SUMMIT"]'); time.sleep(0.5)
    caption(page, "スポット詳細：荷物適性・注意・次発バス。現地で確認することも一緒に持ち歩ける"); time.sleep(6)
    page.click("#modalClose"); time.sleep(2.5)

def main():
    tmp = OUT / "_rec"; shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": W, "height": H}, record_video_dir=str(tmp), record_video_size={"width": W, "height": H})
        page = ctx.new_page()
        t0 = time.time()
        for kind, n, secs, _ in TIMELINE:
            if kind == "slide": show_slide(page, n, secs)
            else: run_poc(page)
        total = time.time() - t0
        ctx.close(); b.close()
    webm = glob.glob(str(tmp / "*.webm"))[0]
    dst = OUT / "promo-2min.webm"; shutil.move(webm, dst); shutil.rmtree(tmp, ignore_errors=True)
    import imageio_ffmpeg; ff = imageio_ffmpeg.get_ffmpeg_exe()  # フル機能ffmpeg（pip install imageio-ffmpeg）
    mp4 = OUT / "promo-2min.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(dst), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", "-an", str(mp4)], check=True)
    print(f"recorded {total:.1f}s -> {dst.name}, {mp4.name} ({mp4.stat().st_size//1024} KB)")

if __name__ == "__main__":
    main()
