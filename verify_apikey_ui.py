import sys
from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOT_DIR = "verification_screenshots_v3"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    # Ensure page is valid
    try:
        page.screenshot(path=path)
        print(f"Screenshot saved: {path}")
    except Exception as e:
        print(f"Screenshot failed: {e}")

def run():
    print("Starting API Key UI Verification...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()

        # 1. Loading App
        print("\n--- 1. Loading App ---")
        try:
            page.goto("http://localhost:3000")
            page.wait_for_selector("#view-editor", state="attached", timeout=10000)

            # Wait a bit for JS to init and auth callback to likely fire
            time.sleep(3)

            # FORCE LOGIN STATE (Bypass Overlay)
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
        except Exception as e:
            print(f"FAIL: App load error: {e}")
            sys.exit(1)

        # 2. Open Settings
        print("\n--- 2. Checking Settings UI ---")
        try:
            # Click Settings Tab
            page.click(".nav-btn[data-target='view-settings']")
            time.sleep(1)

            # Check for AI Configuration Section
            content = page.content()
            if "AI Configuration" in content:
                print("PASS: AI Configuration section found.")
            else:
                print("FAIL: AI Configuration section missing.")
                screenshot(page, "fail_missing_section")
                sys.exit(1)

            # Check Button
            if "Gemini API Key" in content:
                print("PASS: Gemini API Key button found.")
            else:
                print("FAIL: Gemini API Key button missing.")
                screenshot(page, "fail_missing_button")
                sys.exit(1)

        except Exception as e:
            print(f"FAIL: UI Check Error: {e}")
            sys.exit(1)

        # 3. Test Setting Key Logic
        print("\n--- 3. Testing Key Input Interaction ---")
        try:
            # Setup prompt mock BEFORE clicking
            # We want prompt to return a key
            page.evaluate("window.prompt = () => 'TEST_KEY_123';")
            page.evaluate("window.alert = (msg) => console.log('ALERT:', msg);")

            # Click the button (id setting-gemini-key)
            page.click("#setting-gemini-key")
            time.sleep(1)

            # Check status update in UI
            status_el = page.query_selector("#current-gemini-status")
            status = status_el.inner_text()
            if status == "Set":
                 print("PASS: Key status updated to 'Set'.")
            else:
                 print(f"FAIL: Key status mismatch: '{status}'")

            # Verify LocalStorage
            key = page.evaluate("localStorage.getItem('pyide_gemini_key')")
            if key == "TEST_KEY_123":
                print("PASS: Key saved to localStorage correctly.")
            else:
                print(f"FAIL: Key mismatch in localStorage: {key}")

        except Exception as e:
            print(f"FAIL: Interaction Error: {e}")
            screenshot(page, "fail_interaction")
            sys.exit(1)

        screenshot(page, "apikey_ui_success")
        browser.close()

if __name__ == "__main__":
    run()
