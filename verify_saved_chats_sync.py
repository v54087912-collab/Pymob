import sys
from playwright.sync_api import sync_playwright
import time
import os
import json

SCREENSHOT_DIR = "verification_screenshots_chats"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}")

def run():
    print("Starting Saved Chats Sync Verification...")
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

        # --- Test Case: Verify File-Based Saved Chats ---
        print("\n--- 2. Injecting Mock Saved Chat File ---")

        # Inject file into virtual FS
        page.evaluate("""
            window.appState.files['saved_chats/chat_test_file.md'] = '# Test Chat Title\\n\\n### User\\nHello\\n\\n### AI\\nHi there!';
            // Refresh logic might need a nudge if not reactive
        """)

        # Open Sidebar -> Saved Chats
        print("Opening Saved Chats...")
        page.click("#btn-toggle-sidebar")
        page.wait_for_timeout(500)
        page.click("#btn-saved-chats")
        page.wait_for_timeout(1000)

        # Verify File Appears
        try:
            # Title is extracted from filename or content?
            # In code: title = path.split('/').pop().replace('.md', '') -> 'chat_test_file'
            chat_item = page.locator("text=chat_test_file")
            chat_item.wait_for(state="visible", timeout=5000)
            print("PASS: File-based chat found in list.")
        except:
            print("FAIL: File-based chat not found in list.")
            screenshot(page, "chats_list_fail")
            # Log debug info
            chats_count = page.locator("#view-saved-chats .bg-surface").count()
            print(f"Total items in list: {chats_count}")

        # Open the chat
        print("Opening chat item...")
        chat_item.click()
        page.wait_for_timeout(1000)

        # Verify Content
        content = page.inner_text("#view-saved-chats")
        if "Test Chat Title" in content and "Hi there!" in content:
            print("PASS: Chat content displayed correctly (Markdown rendered).")
        else:
            print("FAIL: Chat content mismatch.")
            print(f"Content: {content}")
            screenshot(page, "chat_open_fail")

        screenshot(page, "chats_final")
        browser.close()

if __name__ == "__main__":
    run()
