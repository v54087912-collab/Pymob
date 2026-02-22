import sys
from playwright.sync_api import sync_playwright
import time
import os
import json

SCREENSHOT_DIR = "verification_screenshots_strict"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}")

def run():
    print("Starting Strict Mode & Chat Persistence Verification...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()

        # Mock prompt/alert only (Confirm is custom DOM)
        page.evaluate("""
            window.prompt = (msg, defVal) => 'test';
            window.alert = (msg) => console.log('ALERT_CALLED:', msg);
        """)

        # Capture console logs
        logs = []
        page.on("console", lambda msg: logs.append(f"{msg.type}: {msg.text}"))

        print("\n--- 1. Loading App ---")
        page.goto("http://localhost:5173")
        try:
            page.wait_for_selector(".cm-editor", timeout=15000)
            page.wait_for_timeout(3000)

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
                localStorage.setItem('ai_workspace_mode', 'developer');
            """)
            # Reload to apply dev mode setting
            page.reload()
            page.wait_for_selector(".cm-editor", timeout=15000)
            page.wait_for_timeout(3000)
            # Re-apply UI unlock (since reload resets DOM)
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

        # --- Test Case 1: Strict File Access Guard ---
        print("\n--- 2. Testing Strict File Access Guard ---")

        # Open Workspace
        page.click("#btn-toggle-sidebar")
        page.wait_for_timeout(500)
        page.click("#btn-ai-workspace")
        page.wait_for_timeout(500)

        # Mock Agent Response trying to modify 'evil.py'
        risky_response = json.dumps({
            "choices": [{
                "message": {
                    "content": """
                    I will create a new file.
                    ```json_agent
                    {
                        "thought": "Malicious write",
                        "files": {
                            "evil.py": "print('hacked')"
                        },
                        "command": "run"
                    }
                    ```
                    """
                }
            }]
        })

        def handle_risky(route):
            route.fulfill(status=200, content_type="application/json", body=risky_response)

        page.route("**/functions/ai-workspace-proxy", handle_risky)

        # Send Message
        page.fill("#ai-chat-input", "Do something risky")
        page.click("#btn-ai-send")

        # Wait for Warning Modal
        try:
            print("Waiting for custom confirm modal...")
            page.wait_for_selector("#modal-confirm-custom", timeout=5000)
            print("PASS: Warning modal appeared.")

            # Click Cancel (Deny)
            page.click("#modal-confirm-custom-cancel")
            print("Clicked Cancel.")
        except:
            print("FAIL: Warning modal did not appear.")
            screenshot(page, "strict_guard_fail")

        # Wait for Blocking Logic
        page.wait_for_timeout(2000)

        # Check logs for blocking message
        blocked = False
        for log in logs:
            if "Operation blocked by user" in log:
                blocked = True
                print("PASS: 'Operation blocked by user' log found.")
                break

        if not blocked:
            print("FAIL: Did not find blocking log.")
            # print("Logs:", logs)

        # Verify 'evil.py' was NOT created
        files = page.evaluate("Object.keys(window.appState.files)")
        if "evil.py" in files:
            print("FAIL: 'evil.py' was created despite denial!")
        else:
            print("PASS: 'evil.py' was NOT created.")

        # --- Test Case 2: Save Chat to Storage (Full Session) ---
        print("\n--- 3. Testing Save Chat to Storage ---")

        # Click Save (Header button)
        save_btn = page.locator("#btn-save-ai-file")
        if save_btn.is_visible():
            save_btn.click()
            page.wait_for_timeout(1000)

            # Verify localStorage
            sessions_str = page.evaluate("localStorage.getItem('pyide_saved_sessions')")
            if sessions_str and "Do something risky" in sessions_str:
                print("PASS: Chat session saved to localStorage (found risky message).")
            else:
                print("FAIL: Chat session not found or content mismatch.")
                print("Content:", sessions_str)
        else:
            print("FAIL: Save button not visible.")

        # --- Test Case 3: View Saved Chat (Replica) ---
        print("\n--- 4. Testing Saved Chat Rendering ---")

        # Open Sidebar (It might be closed or open, let's ensure it's open)
        # Check if sidebar is open? The translate-x-full class logic.
        is_closed = page.evaluate("document.getElementById('sidebar-menu').classList.contains('-translate-x-full')")
        if is_closed:
            print("Opening sidebar...")
            page.click("#btn-toggle-sidebar")
            page.wait_for_timeout(500)

        # Click Saved Chats button
        page.click("#btn-saved-chats")
        page.wait_for_timeout(1000)

        # Click the first session
        session_item = page.locator("#view-saved-chats .bg-surface").first
        if session_item.is_visible():
            session_item.click()
            page.wait_for_timeout(1000)

            # Check for content classes in the new view
            # The view is #view-saved-chats
            msgs = page.locator("#view-saved-chats .ai-chat-message")
            count = msgs.count()
            if count >= 2:
                print(f"PASS: Rendered {count} messages in saved view.")

                # Check exact styling classes
                cls = msgs.first.get_attribute("class")
                if "ai-chat-message" in cls and "user" in cls and "animate-slide-up" in cls:
                    print("PASS: Message styling classes preserved (exact replica).")
                else:
                    print(f"FAIL: Styling classes missing. Got: {cls}")
            else:
                print(f"FAIL: Expected at least 2 messages, found {count}.")
                screenshot(page, "saved_view_fail")
        else:
            print("FAIL: No saved session item found in list.")
            screenshot(page, "saved_list_fail")

        screenshot(page, "final_strict_verification")
        browser.close()

if __name__ == "__main__":
    run()
