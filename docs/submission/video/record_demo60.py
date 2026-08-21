#!/usr/bin/env python3
"""提出フォーム3-8用: 公開アプリの操作動画(60秒以内・無音)を録画する。
  実行: /Users/shimadakoutaro/shoken/.venv/bin/python docs/submission/video/record_demo60.py
  出力: docs/submission/video/demo-60s.mp4 (と app/public/video/ へコピーして公開)
"""
import glob, shutil, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright
import record_promo as rp

HERE = Path(__file__).resolve().parent

def main():
    tmp = HERE / "_rec60"; shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": rp.W, "height": rp.H}, record_video_dir=str(tmp),
                            record_video_size={"width": rp.W, "height": rp.H})
        page = ctx.new_page()
        t0 = time.time()
        # ウォームアップ(この区間は -ss で頭からカット)
        page.goto(rp.APP, wait_until="networkidle"); time.sleep(0.5)
        warm = time.time() - t0
        rp.run_app(page)
        time.sleep(0.6)
        ctx.close(); b.close()
    webm = glob.glob(str(tmp / "*.webm"))[0]
    dst = HERE / "demo-60s.webm"; shutil.move(webm, dst); shutil.rmtree(tmp, ignore_errors=True)
    import imageio_ffmpeg; ff = imageio_ffmpeg.get_ffmpeg_exe()
    mp4 = HERE / "demo-60s.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-ss", f"{warm:.2f}", "-i", str(dst),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", "-an", "-t", "59", str(mp4)], check=True)
    print(f"wrote {mp4.name} ({mp4.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    main()
