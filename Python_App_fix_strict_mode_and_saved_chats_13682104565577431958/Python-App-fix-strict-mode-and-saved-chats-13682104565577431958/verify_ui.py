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
            # print(f"Intercepted: {route.request.url}")
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
        except Exception as e:
            print(f"Navigation failed: {e}")
            time.sleep(2)
            page.goto("http://localhost:5173", timeout=20000)

        # Wait for app to load (editor view visible)
        print("Waiting for editor...")
        page.wait_for_selector("#view-editor", state="visible", timeout=30000)

        # Open AI Workspace via JS to avoid UI issues
        print("Opening AI Workspace via JS...")
        page.evaluate("window.uiSwitchView('view-ai-workspace')")

        # Wait for AI Workspace View
        print("Waiting for workspace view...")
        page.wait_for_selector("#view-ai-workspace", state="visible")

        # Toggle Dev Mode
        print("Toggling Dev Mode...")
        # We need to make sure we are in Dev Mode
        toggle_btn = page.locator("#btn-toggle-ai-mode")
        if toggle_btn.is_visible():
             # Check if text contains CHAT (meaning currently in Chat mode)
             # Note: the button text changes to "DEV MODE" when in dev mode.
             # So if it says "CHAT", we are in Chat mode?
             # Wait, let's check ui-workspace.js logic:
             # if (isDevMode) span.textContent = "DEV MODE"
             # else span.textContent = "CHAT"
             # So if it says "CHAT", we are in Chat Mode. We need to click to switch to Dev.
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
