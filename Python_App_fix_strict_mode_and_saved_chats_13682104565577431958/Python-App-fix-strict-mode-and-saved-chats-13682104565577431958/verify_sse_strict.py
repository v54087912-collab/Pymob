import sys
from playwright.sync_api import sync_playwright
import time
import os
import json

SCREENSHOT_DIR = "verification_screenshots_sse_fix"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}")

def run():
    print("Starting SSE Stream Cleaning Verification (Strict)...")
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

        # --- Test Case: SSE "Forced Stream" Pollution NO SPACE ---
        print("\n--- 2. Testing SSE Clean-up Logic (No Space after data:) ---")

        # 1. Open AI Workspace
        page.click("#btn-toggle-sidebar")
        page.wait_for_timeout(500)
        page.click("#btn-ai-workspace")
        page.wait_for_timeout(500)

        # 2. Mock Polluted SSE Response (HTTP 200, but body is SSE text WITHOUT SPACE)
        def handle_sse_pollution_no_space(route):
            print("Intercepted Chat Request - Returning Polluted SSE Stream (No Space)")

            # Construct a raw SSE string without space after data:
            sse_body = (
                'data:{"choices":[{"delta":{"content":"Strict "}}]}\n\n'
                'data:{"choices":[{"delta":{"content":"JSON "}}]}\n\n'
                'data:{"choices":[{"delta":{"content":"Extraction!"}}]}\n\n'
                'data:[DONE]\n\n'
            )

            route.fulfill(
                status=200,
                content_type="application/json",
                body=sse_body
            )

        page.route("**/functions/ai-workspace-proxy", handle_sse_pollution_no_space)

        # 3. Type Message
        page.fill("#ai-chat-input", "Test SSE Strict")

        # 4. Click Send
        page.click("#btn-ai-send")

        # 5. Wait for Response
        try:
            # We expect "Strict JSON Extraction!" to be assembled from the chunks
            page.wait_for_selector("text=Strict JSON Extraction!", timeout=10000)
            print("PASS: SSE stream was correctly cleaned and assembled.")
        except:
            print("FAIL: Chat response not displayed or incorrect.")
            # Get last message text to debug
            msgs = page.locator(".message-content")
            if msgs.count() > 0:
                print(f"Last Message: {msgs.last.inner_text()}")
            screenshot(page, "sse_strict_fail")

        screenshot(page, "sse_strict_final")
        browser.close()

if __name__ == "__main__":
    run()
