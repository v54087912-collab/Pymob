
import time
from playwright.sync_api import sync_playwright

def verify_breadcrumbs():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Open the app
        print("Opening app...")
        try:
            page.goto("http://localhost:5173", timeout=10000)
        except Exception as e:
            print(f"Failed to connect to localhost:5173: {e}")
            # Try to start a server if needed, or fail
            return

        # Wait for page load
        page.wait_for_load_state("networkidle")

        # Bypass Login
        print("Bypassing login...")
        page.evaluate("""
            const overlay = document.getElementById('login-overlay');
            if (overlay) overlay.remove();

            const appContent = document.getElementById('app-content');
            if (appContent) {
                appContent.classList.remove('filter', 'blur-sm', 'pointer-events-none');
            }
        """)

        time.sleep(1)

        # Switch to Files View
        print("Switching to Files view...")
        # Use the bottom nav button for Files
        files_btn = page.locator('.nav-btn[data-target="view-files"]')
        files_btn.click()

        time.sleep(1)

        # Take screenshot
        screenshot_path = "verification_breadcrumbs.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        # check for text
        content = page.content()
        if "MyPythonProject" in content:
            print("FAILURE: 'MyPythonProject' text found in page content!")
        else:
            print("SUCCESS: 'MyPythonProject' text NOT found in page content.")

        if "Projects" in content:
             # Projects might appear elsewhere (e.g. in some other context?), but check specifically for the breadcrumb structure
             # The breadcrumb was "Projects / MyPythonProject"
             print("INFO: 'Projects' word found (might be okay if not in breadcrumbs)")

        browser.close()

if __name__ == "__main__":
    verify_breadcrumbs()
