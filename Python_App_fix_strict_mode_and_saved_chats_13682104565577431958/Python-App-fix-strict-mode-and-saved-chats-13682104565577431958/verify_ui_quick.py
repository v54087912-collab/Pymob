from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()
        page.goto("http://localhost:3000")
        try:
            page.wait_for_selector(".cm-editor", timeout=10000)
        except:
            return

        # Bypass login
        page.evaluate("document.getElementById('login-overlay').remove()")
        page.evaluate("document.getElementById('app-content').classList.remove('filter', 'blur-sm', 'pointer-events-none')")

        page.click("button[data-target='view-settings']")
        time.sleep(0.5)
        page.click("#btn-open-libs")
        page.wait_for_selector("#lib-list div", timeout=5000)
        time.sleep(0.5)
        page.screenshot(path="verification_libraries.png")
        browser.close()

if __name__ == "__main__":
    run()
