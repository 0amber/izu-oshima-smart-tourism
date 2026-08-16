#!/usr/bin/env python3
"""slides.html → slides.pdf（16:9, 1280x720px）＋各スライドPNG。"""
from playwright.sync_api import sync_playwright
from pathlib import Path
HERE = Path(__file__).resolve().parent
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
    pg.goto(f"file://{HERE/'slides.html'}", wait_until="networkidle"); pg.wait_for_timeout(800)
    pg.pdf(path=str(HERE/"slides.pdf"), width="1280px", height="720px", print_background=True,
           margin={"top":"0","bottom":"0","left":"0","right":"0"}, prefer_css_page_size=True)
    # 各スライドPNG（確認用）
    (HERE/"png").mkdir(exist_ok=True)
    for i, el in enumerate(pg.locator(".slide").all(), 1):
        el.screenshot(path=str(HERE/"png"/f"slide{i:02d}.png"))
    b.close()
print("ok")
