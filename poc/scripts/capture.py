#!/usr/bin/env python3
"""PoC画面キャプチャ3点（提出フォーム⑤用）。dist/oshima-smart-course.html を file:// で開いて撮る。"""
from playwright.sync_api import sync_playwright
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / "poc/dist/oshima-smart-course.html"
OUT = ROOT / "docs/submission/captures"
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
    pg.goto(f"file://{HTML}"); pg.wait_for_timeout(500)
    # 1 入力画面
    pg.locator("#inputPanel").screenshot(path=str(OUT/"01_input.png"))
    # 2 荷物あり 1日目
    pg.locator("#planPanel").screenshot(path=str(OUT/"02_plan_luggage.png"))
    # 3 身軽 1日目
    pg.click("#lugOff"); pg.wait_for_timeout(200)
    pg.locator("#planPanel").screenshot(path=str(OUT/"03_plan_light.png"))
    # おまけ: 全画面（荷物あり）
    pg.click("#lugOn"); pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT/"00_full_luggage.png"), full_page=True)
    b.close()
print("captures ->", OUT)
