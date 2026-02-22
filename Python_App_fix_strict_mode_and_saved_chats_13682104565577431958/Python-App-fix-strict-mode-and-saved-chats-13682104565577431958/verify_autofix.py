import sys
from playwright.sync_api import sync_playwright
import time
import os
import json

SCREENSHOT_DIR = "verification_screenshots_v3"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}")

def run():
    print("Starting Auto-Fix Verification Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()

        # Mock prompt/alert
        page.evaluate("""
            window.prompt = (msg, defVal) => 'test';
            window.confirm = () => true;
            window.alert = (msg) => console.log('ALERT_CALLED:', msg);
        """)

        # Capture console logs to verify error propagation
        logs = []
        page.on("console", lambda msg: logs.append(f"{msg.type}: {msg.text}"))

        print("\n--- 1. Loading App ---")
        page.goto("http://localhost:5173")
        try:
            page.wait_for_selector(".cm-editor", timeout=15000)
            page.wait_for_timeout(3000) # Wait for init

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

        # --- Test Case 1: Successful Auto-Fix ---
        print("\n--- 2. Testing Successful Auto-Fix ---")

        # 1. Mock Success Response
        def handle_success(route):
            print("Intercepted Auto-Fix Request (Success Case)")
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "choices": [
                        {
                            "message": {
                                "content": "print('Hello World') # FIX: Corrected syntax"
                            }
                        }
                    ]
                })
            )

        # Set up interception
        page.route("**/functions/ai-proxy", handle_success)

        # 2. Generate an Error
        page.evaluate("window.appState.lastError = 'SyntaxError: unexpected EOF while parsing'")

        # 3. Click Auto-Fix
        btn = page.locator("#btn-auto-fix")
        if not btn.is_visible():
             print("FAIL: Auto-Fix button not visible")
             sys.exit(1)

        btn.click()

        # 4. Wait for code update
        page.wait_for_timeout(2000)
        content = page.inner_text(".cm-content")

        if "print('Hello World')" in content and "# FIX: Corrected syntax" in content:
            print("PASS: Auto-Fix applied changes successfully.")
        else:
            print(f"FAIL: Auto-Fix did not apply changes. Content: {content}")
            screenshot(page, "autofix_fail_success_case")

        print("Logs so far:", logs)
        logs.clear()

        # --- Test Case 2: API Error Handling ---
        print("\n--- 3. Testing API Error Handling ---")

        # 1. Unroute previous handler
        page.unroute("**/functions/ai-proxy")

        # 2. Mock Error Response (500)
        def handle_error(route):
            try:
                print("Intercepted Auto-Fix Request (Error Case)")
                route.fulfill(
                    status=500,
                    content_type="application/json",
                    body=json.dumps({"error": "LongCat API Overloaded"})
                )
                print("Fulfilled Error Request")
            except Exception as e:
                print(f"Error fulfilling: {e}")

        page.route("**/functions/ai-proxy", handle_error)

        # 3. Reset State
        page.evaluate("window.appState.lastError = 'IndentationError: unexpected indent'")

        # 5. Click Auto-Fix
        btn.click()

        # 6. Wait for response
        page.wait_for_timeout(3000)

        # Check logs for the specific error message propagated from ai-debugger.js
        found_error = False
        for log in logs:
            if "LongCat API Overloaded" in log:
                found_error = True
                print(f"PASS: Found expected error in console: {log}")
                break

        if not found_error:
            print("FAIL: Did not find 'LongCat API Overloaded' in console logs.")
            print("All Logs:", logs)

        screenshot(page, "autofix_final")
        browser.close()

if __name__ == "__main__":
    run()
