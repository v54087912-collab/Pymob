import sys
from playwright.sync_api import sync_playwright
import time
import os
import json

SCREENSHOT_DIR = "verification_screenshots_domain_fixes"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}")

def run():
    print("Starting Comprehensive Domain Verification...")
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
                // Mock Developer Mode for features
                localStorage.setItem('ai_workspace_mode', 'developer');
            """)
        except:
            print("FAIL: App load timeout")
            sys.exit(1)

        # --- Domain 2 Check: Magic Wand Gone & Header Height ---
        print("\n--- Testing Domain 2: UI Cleanup ---")

        # Check if Magic Wand button is gone
        wand_btn = page.locator("#btn-toggle-command-bar")
        if not wand_btn.is_visible():
            print("PASS: Magic Wand button is removed/hidden.")
        else:
            print("FAIL: Magic Wand button is still visible.")

        # Check Workspace Header Height
        page.click("#btn-toggle-sidebar")
        page.wait_for_timeout(500)
        page.click("#btn-ai-workspace")
        page.wait_for_timeout(500)

        header = page.locator("#view-ai-workspace > div:first-child")
        box = header.bounding_box()
        if box['height'] >= 64: # h-16 is 4rem = 64px
            print(f"PASS: Workspace header has fixed height (approx {box['height']}px).")
        else:
            print(f"FAIL: Workspace header height is too small ({box['height']}px).")

        # --- Domain 4 Check: Save Chat ---
        print("\n--- Testing Domain 4: Save Chat to File ---")

        # Add a dummy message first (via console logic or typing)
        page.fill("#ai-chat-input", "Test Save")

        # Mock Response
        page.route("**/functions/ai-workspace-proxy", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"choices":[{"message":{"content":"Saved Response"}}]})
        ))

        page.click("#btn-ai-send")
        page.wait_for_selector("text=Saved Response", timeout=5000)

        # Click Save File
        save_btn = page.locator("#btn-save-ai-file")
        if save_btn.is_visible():
            save_btn.click()
            page.wait_for_timeout(1000) # Wait for toast and FS write

            # Check FS state
            files = page.evaluate("window.appState.files")
            found_saved = any(k.startswith("saved_chats/") for k in files.keys())

            if found_saved:
                print("PASS: Saved chat file found in virtual file system.")
            else:
                print("FAIL: No file found in 'saved_chats/'.")
        else:
            print("FAIL: Save File button not found.")

        # --- Domain 1 Check: AI Feature (Refactor) ---
        print("\n--- Testing Domain 1: AI Features (Refactor) ---")

        # Go back to Editor
        page.click("#btn-close-ai-workspace")
        page.wait_for_timeout(500)

        # Mock AI Proxy for Refactor (Ensure stream: false is used)
        def handle_refactor(route):
            try:
                data = route.request.post_data_json
                if data.get('stream') is False:
                    print("PASS: Refactor request uses stream: false")
                else:
                    print(f"FAIL: Refactor request used stream: {data.get('stream')}")

                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps({"choices":[{"message":{"content":"# Refactored Code"}}]})
                )
            except:
                print("FAIL: Could not parse Refactor request")

        page.route("**/functions/ai-proxy", handle_refactor)

        # Open Sidebar
        page.click("#btn-toggle-sidebar")
        page.wait_for_timeout(500)

        # Click Refactor
        page.click("#btn-ai-refactor")
        page.wait_for_timeout(2000)

        # Check Editor Content
        content = page.inner_text(".cm-content")
        if "# Refactored Code" in content:
            print("PASS: Editor updated with refactored code.")
        else:
            print("FAIL: Editor content not updated.")

        screenshot(page, "final_domain_verification")
        browser.close()

if __name__ == "__main__":
    run()
