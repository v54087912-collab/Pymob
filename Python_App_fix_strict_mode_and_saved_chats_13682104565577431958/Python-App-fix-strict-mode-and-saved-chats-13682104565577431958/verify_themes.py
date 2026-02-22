import sys
from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOT_DIR = "verification_screenshots_v3"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}")

def run():
    print("Starting Theme Verification Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()

        print("\n--- 1. Loading App ---")
        page.goto("http://localhost:5173")
        try:
            page.wait_for_selector(".cm-editor", timeout=10000)
            time.sleep(1)

            # FORCE LOGIN STATE
            page.evaluate("""
                const overlay = document.getElementById('login-overlay');
                if(overlay) overlay.remove();
                const app = document.getElementById('app-content');
                if(app) {
                    app.classList.remove('filter', 'blur-sm', 'pointer-events-none', 'blur-active');
                    app.style.filter = 'none';
                    app.style.pointerEvents = 'auto';
                }
            """)
        except:
            print("FAIL: App load timeout")
            sys.exit(1)

        # 2. Open Settings
        print("\n--- 2. Opening Settings ---")
        try:
            page.click(".nav-btn[data-target='view-settings']")
            time.sleep(0.5)

            # Check default theme (One Dark)
            theme_name = page.inner_text("#current-theme-name")
            if "One Dark" in theme_name:
                print("PASS: Default theme is One Dark.")
            else:
                print(f"FAIL: Default theme mismatch: {theme_name}")

            # Check computed styles for One Dark
            bg_color = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--color-dark').trim()")
            if bg_color.lower() == "#282c34":
                print("PASS: One Dark background variable correct.")
            else:
                print(f"FAIL: One Dark background variable mismatch: {bg_color}")

        except Exception as e:
            print(f"FAIL: Settings open error. {e}")
            sys.exit(1)

        # 3. Open Theme Modal
        print("\n--- 3. Opening Theme Modal ---")
        try:
            page.click("#setting-theme")
            time.sleep(0.5)

            # Check for list items
            items = page.query_selector_all("#modal-selection-list > div")
            if len(items) >= 6:
                print(f"PASS: Found {len(items)} themes in modal.")
            else:
                print(f"FAIL: Found only {len(items)} themes.")

            # Check for preview circle
            # Usually the 4th item is GitHub Light if order is preserved
            preview = items[3].query_selector("div.rounded-full")
            if preview:
                print("PASS: Theme preview circle found.")
            else:
                print("FAIL: Theme preview circle not found.")

        except Exception as e:
            print(f"FAIL: Theme modal error. {e}")

        # 4. Select GitHub Light
        print("\n--- 4. Switching to GitHub Light ---")
        try:
            # Click GitHub Light
            items = page.query_selector_all("#modal-selection-list > div")
            found = False
            for item in items:
                if "GitHub Light" in item.inner_text():
                    item.click()
                    found = True
                    break

            if not found:
                 print("FAIL: GitHub Light option not found.")

            time.sleep(1) # Wait for transition

            # Check variables
            bg_color = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--color-dark').trim()")
            if bg_color.lower() == "#ffffff":
                print("PASS: GitHub Light background variable applied.")
            else:
                print(f"FAIL: GitHub Light background variable mismatch: {bg_color}")

            # Check Editor Background
            editor_bg = page.evaluate("getComputedStyle(document.querySelector('.cm-editor')).backgroundColor")
            print(f"Editor Background: {editor_bg}")

            if "255, 255, 255" in editor_bg:
                 print("PASS: Editor background is white.")
            else:
                 print(f"WARN: Editor background might be off: {editor_bg}")

        except Exception as e:
            print(f"FAIL: Theme switch error. {e}")

        screenshot(page, "github_light_theme")
        browser.close()

if __name__ == "__main__":
    run()
