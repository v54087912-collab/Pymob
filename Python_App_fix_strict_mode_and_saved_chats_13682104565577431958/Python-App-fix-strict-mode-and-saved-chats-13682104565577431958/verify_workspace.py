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
    print("Starting AI Workspace Verification Test...")
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

        # --- Test Case: AI Workspace Chat (Non-Streaming) ---
        print("\n--- 2. Testing AI Workspace Chat ---")

        # 1. Open AI Workspace
        page.click("#btn-toggle-sidebar")
        page.wait_for_timeout(500)
        page.click("#btn-ai-workspace")
        page.wait_for_timeout(500)

        # 2. Mock Success Response (JSON, not stream)
        def handle_chat_success(route):
            print("Intercepted Chat Request")
            # Verify stream: false was sent
            try:
                post_data = route.request.post_data_json
                if post_data.get('stream') is False:
                    print("PASS: Request payload contains 'stream': false")
                else:
                    print(f"FAIL: Request payload missing 'stream': false. Got: {post_data}")
            except:
                print("FAIL: Could not parse POST data")

            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "choices": [
                        {
                            "message": {
                                "content": "Hello! I am ready to help you with your code."
                            }
                        }
                    ]
                })
            )

        page.route("**/functions/ai-workspace-proxy", handle_chat_success)

        # 3. Type Message
        page.fill("#ai-chat-input", "Hello AI")

        # 4. Click Send
        page.click("#btn-ai-send")

        # 5. Wait for Response
        try:
            # Look for the response in the chat output
            page.wait_for_selector("text=Hello! I am ready to help you with your code.", timeout=10000)
            print("PASS: Chat response displayed correctly.")
        except:
            print("FAIL: Chat response not displayed.")
            screenshot(page, "workspace_fail")

        # 6. Verify Loading State Reset
        is_generating = page.evaluate("window.appState ? window.appState.isGenerating : false") # Note: appState might not be globally exposed identically, relying on UI state
        # Better: Check if input is enabled and Send button is visible
        input_disabled = page.is_disabled("#ai-chat-input")
        if not input_disabled:
            print("PASS: Input re-enabled (Loading state cleared).")
        else:
            print("FAIL: Input still disabled.")

        screenshot(page, "workspace_final")
        browser.close()

if __name__ == "__main__":
    run()
