from playwright.sync_api import sync_playwright
import time
import json

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Define route handler
        def handle_route(route):
            if "ai-workspace-proxy" in route.request.url:
                response_data = {
                    "choices": [{
                        "message": {
                            "content": "I need permission to run this command. <<PERM_REQUEST>>"
                        }
                    }]
                }
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(response_data)
                )
            else:
                route.continue_()

        # Set up route interception
        page.route("**/*", handle_route)

        print("Navigating to app...")
        try:
            page.goto("http://localhost:5173", timeout=10000)
        except Exception:
            time.sleep(2)
            page.goto("http://localhost:5173", timeout=20000)

        # Force bypass login overlay
        print("Bypassing login overlay...")
        page.wait_for_selector("#login-overlay")
        page.evaluate("""
            document.getElementById('login-overlay').classList.add('hidden');
            const app = document.getElementById('app-content');
            if(app) {
                app.classList.remove('filter', 'blur-sm', 'pointer-events-none', 'blur-active');
            }
        """)

        # Open AI Workspace via JS
        print("Opening AI Workspace via JS...")
        page.evaluate("window.uiSwitchView('view-ai-workspace')")

        # Wait for AI Workspace View
        page.wait_for_selector("#view-ai-workspace", state="visible")

        # Toggle Dev Mode
        print("Toggling Dev Mode...")
        toggle_btn = page.locator("#btn-toggle-ai-mode")
        if toggle_btn.is_visible():
             if "CHAT" in toggle_btn.inner_text():
                 toggle_btn.click()
                 time.sleep(1)

        # Send Message
        print("Sending message...")
        page.fill("#ai-chat-input", "Run command")
        page.click("#btn-ai-send")

        # Wait for Permission UI
        print("Waiting for permission UI...")
        try:
            page.wait_for_selector(".btn-perm-yes", state="visible", timeout=10000)
            print("Permission UI detected!")
        except Exception:
            print("Timeout waiting for permission UI. Taking debug screenshot.")
            page.screenshot(path="debug_permission_fail.png")
            browser.close()
            return

        # Screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification_permission_ui.png")

        browser.close()

if __name__ == "__main__":
    run()
