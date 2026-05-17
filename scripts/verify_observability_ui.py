from pathlib import Path

from playwright.sync_api import sync_playwright

SCREENSHOT_PATH = Path('/tmp/cancer-observability-home.png')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1200})
    page.goto('http://127.0.0.1:4173', wait_until='networkidle')
    page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
    print(f'screenshot={SCREENSHOT_PATH}')
    print(f'title={page.title()}')
    print(f'url={page.url}')
    browser.close()
