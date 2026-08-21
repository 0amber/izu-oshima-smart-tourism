#!/usr/bin/env python3
"""
2分プロモーションビデオ（無音）を Playwright の画面録画で生成する。
  構成：promo.html?part=1（モーショングラフィックス 44秒）→ 公開アプリ実演（約34秒・テロップ付き）→ promo.html?part=2（仕組み〜QR付きエンドカード）
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
# 実演は公開アプリ本番。pages.dev 側は ANTHROPIC_API_KEY 設定済みで実際のAI解説が流れる
APP = "https://oshima-smart-course.pages.dev/"
W, H = 1280, 720

CAPTION_CSS = "#cap{position:fixed;left:0;right:0;bottom:0;background:rgba(8,60,112,.92);color:#fff;font:700 26px/1.4 -apple-system,'Hiragino Sans',sans-serif;padding:14px 28px;z-index:9999}"

def caption(page, text):
    page.evaluate("""t=>{let c=document.getElementById('cap');if(!c){c=document.createElement('div');c.id='cap';document.body.appendChild(c);
      const s=document.createElement('style');s.textContent=%r;document.head.appendChild(s);}c.textContent=t;}""" % CAPTION_CSS, text)

def scroll_to(page, sel, block="center"):
    page.evaluate("s=>document.querySelector(s).scrollIntoView({behavior:'smooth',block:'%s'})" % block, sel)
    time.sleep(0.7)

def play_part(page, part):
    page.goto(f"file://{PROMO}?part={part}", wait_until="load")
    dur = page.evaluate("window.__DURATION")
    time.sleep(dur)

def run_app(page):
    page.goto(APP, wait_until="load"); page.wait_for_selector("#timeline li"); time.sleep(0.4)
    caption(page, "公開Webアプリ — QRコードを読むだけで、誰でもすぐ使えます"); time.sleep(3.0)
    scroll_to(page, "#tripDate")
    caption(page, "日付・期間（日帰り〜2泊3日）・港・荷物を選ぶだけ"); time.sleep(3.0)
    scroll_to(page, "#timeline", "start")
    caption(page, "🧳 荷物あり：10:20港発 → 椿・花ガーデン → ホテルへ。すべて実在の便（✅時刻表と一致）"); time.sleep(4.6)
    page.click("#lugOff"); time.sleep(0.4); scroll_to(page, "#timeline", "start")
    caption(page, "🎒 身軽に切り替えると三原山へ直行。旅程が瞬時に組み替わる"); time.sleep(4.2)
    page.click("#lugOn"); time.sleep(0.3)
    page.click("#dayTabs .tab:nth-child(2)"); time.sleep(0.4)
    scroll_to(page, "#routeMap")
    caption(page, "2日目：荷物を預けて山頂へ → 13:37最終便 → 14:20の船に接続。ルートは地図で確認"); time.sleep(4.8)
    scroll_to(page, "#explainBtn")
    page.click("#explainBtn")
    caption(page, "AIガイドが旅程を解説（実在便だけを引用）。🔊 バスガイド風の音声読み上げにも対応"); time.sleep(1.4)
    scroll_to(page, "#explainText")
    time.sleep(4.6)

def main():
    tmp = HERE / "_rec"; shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": W, "height": H}, record_video_dir=str(tmp), record_video_size={"width": W, "height": H})
        page = ctx.new_page()
        t0 = time.time()
        # 本編前にアプリを一度読み込んでキャッシュを温める(本編のgotoで白画面が出ないように)。
        # この区間は後段のffmpegで -ss により頭からカットする。
        page.goto(APP, wait_until="networkidle"); time.sleep(0.5)
        warm = time.time() - t0
        play_part(page, 1)
        run_app(page)
        play_part(page, 2)
        total = time.time() - t0
        ctx.close(); b.close()
    webm = glob.glob(str(tmp / "*.webm"))[0]
    dst = HERE / "promo-2min.webm"; shutil.move(webm, dst); shutil.rmtree(tmp, ignore_errors=True)
    import imageio_ffmpeg; ff = imageio_ffmpeg.get_ffmpeg_exe()
    mp4 = HERE / "promo-2min.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-ss", f"{warm:.2f}", "-i", str(dst), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", "-an", "-t", "122", str(mp4)], check=True)
    print(f"recorded {total:.1f}s (warmup {warm:.1f}s cut) -> {dst.name}, {mp4.name} ({mp4.stat().st_size//1024} KB)")

if __name__ == "__main__":
    main()
