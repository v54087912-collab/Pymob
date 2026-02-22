
import os
import time
from playwright.sync_api import sync_playwright

def verify_custom_dialogs():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating...")
        page.goto("http://localhost:5173", wait_until="networkidle")

        print(f"Initial URL: {page.url}")
        time.sleep(3) # Wait for any redirects
        print(f"Stable URL: {page.url}")

        # Wait for app to verify it loaded
        try:
            page.wait_for_selector("#app-content", state="attached", timeout=10000)
            print("App content found.")
        except:
            print("App content NOT found. Screenshotting state.")
            page.screenshot(path="debug_nav_fail.png")
            browser.close()
            return

        # 1. Test Toast
        print("Testing Toast...")
        try:
            # We use a try-except block for the evaluation to catch navigation errors
            page.evaluate("import('./js/ui-utils.js').then(m => { m.showToast('This is a success toast!', 'success'); })")
            time.sleep(1) # Wait for animation
            page.screenshot(path="verification_toast.png")
            print("Toast screenshot saved.")
        except Exception as e:
            print(f"Toast failed: {e}")
            page.screenshot(path="debug_toast_fail.png")

        # 2. Test Confirm
        print("Testing Confirm Modal...")
        try:
            page.evaluate("import('./js/ui-utils.js').then(m => { m.showConfirm('Confirm Action', 'Are you sure you want to proceed?'); })")
            time.sleep(1)
            page.screenshot(path="verification_confirm.png")
            print("Confirm screenshot saved.")

            # Close the modal
            if page.locator("#modal-confirm-custom #modal-confirm-custom-cancel").is_visible():
                page.locator("#modal-confirm-custom #modal-confirm-custom-cancel").click()
                time.sleep(0.5)
            else:
                print("Confirm modal not visible?")
        except Exception as e:
             print(f"Confirm failed: {e}")


        # 3. Test Prompt
        print("Testing Prompt Modal...")
        try:
            page.evaluate("import('./js/ui-utils.js').then(m => { m.showPrompt('Enter Name', 'Please enter your name:', 'John Doe'); })")
            time.sleep(1)
            page.screenshot(path="verification_prompt.png")
            print("Prompt screenshot saved.")
        except Exception as e:
            print(f"Prompt failed: {e}")

        browser.close()

if __name__ == "__main__":
    verify_custom_dialogs()
