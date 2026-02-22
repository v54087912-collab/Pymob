import sys
from playwright.sync_api import sync_playwright
import time
import os
import json

SCREENSHOT_DIR = "verification_screenshots_aimode"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}")

def run():
    print("Starting AI Mode Verification Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()

        print("\n--- 1. Loading App ---")
        page.goto("http://localhost:3000")
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

        # --- 2. Verifying Settings UI ---
        print("\n--- 2. Verifying Settings UI ---")
        page.click(".nav-btn[data-target='view-settings']")
        page.wait_for_timeout(1000)

        # Check Gemini Key is gone
        gemini_btn = page.locator("#setting-gemini-key")
        if gemini_btn.count() > 0:
            print("FAIL: Gemini Key setting still visible")
            sys.exit(1)
        else:
             print("PASS: Gemini Key setting removed")

        # Check AI Mode is present
        ai_mode_btn = page.locator("#setting-ai-mode")
        if ai_mode_btn.count() > 0:
            print("PASS: AI Mode setting visible")
        else:
            print("FAIL: AI Mode setting missing")
            sys.exit(1)

        # Check Default Value (Super Fast)
        current_mode = page.locator("#current-ai-mode").inner_text()
        if "Super Fast" in current_mode:
            print(f"PASS: Default AI Mode is 'Super Fast' ({current_mode})")
        else:
            print(f"FAIL: Unexpected default AI Mode: {current_mode}")

        # --- 3. Change AI Mode ---
        print("\n--- 3. Changing AI Mode to Ultra ---")
        ai_mode_btn.click()
        page.wait_for_timeout(1000)

        # Select "Ultra"
        # Find element containing text "Ultra" inside modal list
        # Playwright Python filter usage: locator.filter(has_text="...")
        options = page.locator("#modal-selection-list > div")
        ultra_option = options.filter(has_text="Ultra").first

        if ultra_option.count() == 0:
             print("FAIL: Ultra option not found in modal")
             screenshot(page, "modal_fail")
             sys.exit(1)

        ultra_option.click()
        page.wait_for_timeout(1000)

        # Verify UI Update
        current_mode_el = page.locator("#current-ai-mode")
        current_mode = current_mode_el.inner_text()
        if "Ultra" in current_mode:
             print("PASS: AI Mode updated to 'Ultra' in UI")
        else:
             print(f"FAIL: AI Mode not updated in UI. Found: {current_mode}")
             screenshot(page, "ui_update_fail")

        # --- 4. Verify Backend Payload ---
        print("\n--- 4. Verifying Backend Payload ---")

        # Mock Request
        def handle_request(route):
            request = route.request
            try:
                # Need to check if it's JSON
                if "application/json" in request.headers.get("content-type", ""):
                    post_data = request.post_data_json
                    if post_data:
                        model = post_data.get("model")
                        print(f" intercepted model: {model}")

                        if model == "LongCat-Flash-Thinking":
                            print("PASS: Correct model sent to backend.")
                            route.fulfill(
                                status=200,
                                content_type="application/json",
                                body=json.dumps({
                                    "choices": [
                                        {
                                            "message": {
                                                "content": "print('Fixed') # FIX: Logic"
                                            }
                                        }
                                    ]
                                })
                            )
                            return
                        else:
                            print(f"FAIL: Incorrect model sent: {model}")

                # Fallback
                route.fulfill(status=400, body="Bad Request")

            except Exception as e:
                print(f"Error parsing request: {e}")
                route.continue_()

        # Set up route interception
        page.route("**/functions/ai-proxy", handle_request)

        # Go back to Editor
        page.click(".nav-btn[data-target='view-editor']")
        page.wait_for_timeout(1000)

        # Generate Error State
        page.evaluate("window.appState.lastError = 'SyntaxError: test'")

        # Trigger Auto-Fix
        # Need to ensure button is clickable
        auto_fix_btn = page.locator("#btn-auto-fix")
        auto_fix_btn.click()

        # Wait for response processing
        page.wait_for_timeout(3000)

        screenshot(page, "ai_mode_final")
        browser.close()

if __name__ == "__main__":
    run()
