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
    print("Starting Feature Verification Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()

        # Mock prompt and confirm to handle new interactions
        page.evaluate("""
            window.prompt = (msg, defVal) => {
                if (msg.includes('name')) return 'test_share.py';
                return 'file';
            };
            window.confirm = () => true;
            window.alert = (msg) => console.log('ALERT:', msg);
        """)

        print("\n--- 1. Loading App ---")
        page.goto("http://localhost:3000")
        try:
            page.wait_for_selector(".cm-editor", timeout=10000)

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
            time.sleep(1)
        except:
            print("FAIL: App load timeout")
            sys.exit(1)

        # 2. Test Gutter Width Controller
        print("\n--- 2. Testing Gutter Width Controller ---")
        try:
            # Default should be compact (minimized) - Measure BEFORE hiding editor
            width_compact = page.evaluate("document.querySelector('.cm-gutters').getBoundingClientRect().width")
            print(f"Compact Width: {width_compact}px")

            page.click(".nav-btn[data-target='view-settings']")
            time.sleep(0.5)

            # Change to Wide
            page.click("#setting-gutter-width")
            time.sleep(0.5)
            page.click("#modal-selection-list > div:nth-child(3)") # 3rd option is Wide
            time.sleep(0.5)

            # Check body class
            body_class = page.get_attribute("body", "class")
            if "gutter-wide" in body_class:
                print("PASS: Body class updated to gutter-wide")
            else:
                print(f"FAIL: Body class mismatch: {body_class}")

            # Switch back to editor to measure
            page.click(".nav-btn[data-target='view-editor']")
            time.sleep(0.5)

            # Check width increase
            width_wide = page.evaluate("document.querySelector('.cm-gutters').getBoundingClientRect().width")
            print(f"Wide Width: {width_wide}px")

            if width_wide > width_compact:
                print("PASS: Gutter width increased.")
            else:
                 print("FAIL: Gutter width did not increase.")

            # Reset to compact for further tests (better for space)
            page.click(".nav-btn[data-target='view-settings']")
            time.sleep(0.5)
            page.click("#setting-gutter-width")
            time.sleep(0.5)
            page.click("#modal-selection-list > div:nth-child(1)")
            time.sleep(0.5)

        except Exception as e:
            print(f"FAIL: Gutter test error. {e}")

        # 3. Test Snippets
        print("\n--- 3. Testing Snippets ---")
        try:
            page.click(".nav-btn[data-target='view-editor']")
            time.sleep(0.5)

            # Clear editor
            page.click(".cm-content")
            page.keyboard.press("Control+a")
            page.keyboard.press("Backspace")

            # Open Sidebar
            page.click("#btn-toggle-sidebar")
            time.sleep(0.5)

            # Click 'def' snippet
            page.click("button[onclick*='insert-snippet'][onclick*='def']")
            time.sleep(0.5)

            content = page.inner_text(".cm-content")
            if "def function_name" in content:
                print("PASS: Snippet inserted.")
            else:
                print(f"FAIL: Snippet not found. Content: {content}")
        except Exception as e:
             print(f"FAIL: Snippet test error. {e}")

        # 4. Test Formatter (PEP-8 / AST)
        print("\n--- 4. Testing Formatter ---")
        try:
            # Clear editor
            page.click(".cm-content")
            page.keyboard.press("Control+a")
            page.keyboard.press("Backspace")

            # Insert messy code
            messy_code = "def  foo( ):\n  print( 'bar' )" # bad spacing
            page.keyboard.type(messy_code)

            # Open Sidebar -> Format PEP-8
            page.click("#btn-toggle-sidebar")
            time.sleep(0.5)
            page.click("button[onclick*='format-pep8']")

            # Wait for worker (might take a sec)
            time.sleep(3)

            content = page.inner_text(".cm-content")
            # Python AST unparse standardizes to:
            # def foo():
            #     print('bar')

            if "def foo():" in content and "print('bar')" in content:
                 print("PASS: Code formatted.")
            else:
                 print(f"FAIL: Formatting failed/unexpected. Content:\n{content}")

        except Exception as e:
            print(f"FAIL: Formatter test error. {e}")

        # 5. Test Line Operations
        print("\n--- 5. Testing Line Operations ---")
        try:
            # Clear
            page.click(".cm-content")
            page.keyboard.press("Control+a")
            page.keyboard.press("Backspace")
            page.keyboard.type("Line 1\nLine 2")

            # Move cursor to Line 1
            page.keyboard.press("Control+Home")

            # Duplicate
            page.click("#btn-toggle-sidebar")
            time.sleep(0.5)
            page.click("button[onclick*='duplicate-line']")
            time.sleep(0.5)

            content = page.inner_text(".cm-content")
            if content.count("Line 1") == 2:
                 print("PASS: Duplicate Line working.")
            else:
                 print("FAIL: Duplicate Line failed.")

        except Exception as e:
             print(f"FAIL: Line ops error. {e}")

        screenshot(page, "final_features")
        browser.close()

if __name__ == "__main__":
    run()
