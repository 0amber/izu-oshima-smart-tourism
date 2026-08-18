#!/usr/bin/env python3
"""
2分プロモーションビデオ（無音）を Playwright の画面録画で生成する。
  構成：promo.html?part=1（モーショングラフィックス 44秒）→ PoC実演（36秒）→ promo.html?part=2（40秒）
  出力：docs/submission/video/promo-2min.mp4（1280x720, H.264）
  実行：/Users/shimadakoutaro/shoken/.venv/bin/python docs/submission/video/record_promo.py
  依存：playwright, imageio-ffmpeg
"""
import glob, shutil, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROMO = HERE / "promo.html"
POC = ROOT / "poc/dist/oshima-smart-course.html"
W, H = 1280, 720

CAPTION_CSS = "#cap{position:fixed;left:0;right:0;bottom:0;background:rgba(8,60,112,.92);color:#fff;font:700 26px/1.4 -apple-system,'Hiragino Sans',sans-serif;padding:14px 28px;z-index:9999}"

def caption(page, text):
    page.evaluate("""t=>{let c=document.getElementById('cap');if(!c){c=document.createElement('div');c.id='cap';document.body.appendChild(c);
      const s=document.createElement('style');s.textContent=%r;document.head.appendChild(s);}c.textContent=t;}""" % CAPTION_CSS, text)

def scroll_timeline(page):
    page.evaluate("document.getElementById('timeline').scrollIntoView({behavior:'smooth',block:'start'})"); time.sleep(0.7)

def play_part(page, part):
    page.goto(f"file://{PROMO}?part={part}", wait_until="load")
    dur = page.evaluate("window.__DURATION")
    time.sleep(dur)

def run_poc(page):
    page.goto(f"file://{POC}"); page.wait_for_selector("#timeline .card"); time.sleep(0.4)
    caption(page, "実演：港・到着時刻・荷物の有無を選ぶだけ。バス便はすべてGTFSの実在便（✅時刻表と一致）"); time.sleep(5)
    page.evaluate("document.getElementById('planPanel').scrollIntoView({behavior:'smooth'})"); time.sleep(3)
    caption(page, "🧳 荷物あり：10:20港発 → 10:28 椿・花ガーデン → 12:48便でホテルへ。三原山には行かない"); time.sleep(6)
    page.click("#lugOff"); time.sleep(0.3); scroll_timeline(page)
    caption(page, "🎒 身軽に切り替えると… 10:20港発 → 10:45 三原山頂口へ直行。旅程が組み替わる"); time.sleep(7)
    page.click("#lugOn"); time.sleep(0.3)
    page.click("#dayTabs .tab:nth-child(2)"); time.sleep(0.3); scroll_timeline(page)
    caption(page, "2日目：荷物を預けて08:38山頂へ → 11:20下山・荷物回収 → 13:37最終便で港 → 14:20大型客船"); time.sleep(7.5)
    page.click('#timeline .card.spot[data-spot="SUMMIT"]'); time.sleep(0.4)
    caption(page, "スポット詳細：荷物適性・注意・次発バス。現地で確認することも一緒に持ち歩ける"); time.sleep(5)
    page.click("#modalClose"); time.sleep(1.5)

def main():
    tmp = HERE / "_rec"; shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": W, "height": H}, record_video_dir=str(tmp), record_video_size={"width": W, "height": H})
        page = ctx.new_page()
        t0 = time.time()
        play_part(page, 1)
        run_poc(page)
        play_part(page, 2)
        total = time.time() - t0
        ctx.close(); b.close()
    webm = glob.glob(str(tmp / "*.webm"))[0]
    dst = HERE / "promo-2min.webm"; shutil.move(webm, dst); shutil.rmtree(tmp, ignore_errors=True)
    import imageio_ffmpeg; ff = imageio_ffmpeg.get_ffmpeg_exe()
    mp4 = HERE / "promo-2min.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(dst), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", "-an", str(mp4)], check=True)
    print(f"recorded {total:.1f}s -> {dst.name}, {mp4.name} ({mp4.stat().st_size//1024} KB)")

if __name__ == "__main__":
    main()
