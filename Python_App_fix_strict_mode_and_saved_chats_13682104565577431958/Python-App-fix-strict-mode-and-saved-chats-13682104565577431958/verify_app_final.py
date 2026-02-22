import os
import time
import subprocess
from playwright.sync_api import sync_playwright

def verify_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 400, 'height': 800}) # Mobile view
        page = context.new_page()

        try:
            print("Navigating to http://localhost:5173")
            page.goto("http://localhost:5173")
            page.wait_for_load_state("networkidle")

            # Bypass login/onboarding
            page.evaluate("""
                const overlay = document.getElementById('login-overlay');
                if(overlay) overlay.remove();
                const app = document.getElementById('app-content');
                if(app) app.classList.remove('filter', 'blur-sm', 'pointer-events-none');
            """)

            # 1. Verify File List Loaded (Local Persistence)
            print("Verifying File List...")
            # Wait for file list to populate
            try:
                page.wait_for_selector('#file-list div', timeout=5000)
                print("File list populated.")
            except:
                print("File list empty (might be first run).")

            # 2. Verify Execution Mode UI
            print("Verifying Settings UI...")
            page.click('.nav-btn[data-target="view-settings"]')
            time.sleep(1)

            page.screenshot(path="verification_screenshots/settings_view.png")
            print("Screenshot saved: settings_view.png")

            exec_mode = page.wait_for_selector('#setting-exec-mode')
            if exec_mode.is_visible():
                print("Execution Mode Setting Visible")
            else:
                print("Execution Mode Setting HIDDEN")

        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            browser.close()

if __name__ == "__main__":
    # Start server
    print("Starting Vite Server...")
    server = subprocess.Popen(["npm", "run", "dev", "--", "--port", "5173", "--host"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(5)
    try:
        verify_app()
    finally:
        server.terminate()
        try:
            os.kill(server.pid + 1, 9)
        except:
            pass
