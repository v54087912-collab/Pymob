import time
from playwright.sync_api import sync_playwright

def verify_v3():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate
        print("Navigating to http://localhost:5173/index.html...")
        page.goto("http://localhost:5173/index.html")

        # Bypass login
        try:
            page.wait_for_selector("#login-overlay", state="visible", timeout=5000)
            page.evaluate("document.getElementById('login-overlay').remove()")
            page.evaluate("document.getElementById('app-content').classList.remove('filter', 'blur-sm', 'pointer-events-none')")
            print("Login bypassed.")
        except:
            print("No login overlay found or already bypassed.")

        # Wait for app
        time.sleep(2)

        # Check loaded stylesheets
        print("Checking stylesheets...")
        sheets = page.evaluate("""() => {
            return Array.from(document.styleSheets).map(s => s.href);
        }""")
        print("Loaded stylesheets:", sheets)

        # Check if style.css rules are present
        print("Checking rules in style.css...")
        # Accessing rules might be blocked by CORS if local file protocol, but we are on localhost
        # We can try to find the rule for .terminal-container
        rule_found = page.evaluate("""() => {
            for (let sheet of document.styleSheets) {
                if (sheet.href && sheet.href.includes('style.css')) {
                    try {
                        for (let rule of sheet.cssRules) {
                            if (rule.selectorText === '.terminal-container') {
                                return true;
                            }
                        }
                    } catch (e) {
                        return 'Error accessing rules: ' + e.message;
                    }
                }
            }
            return false;
        }""")
        print("Rule .terminal-container found in style.css:", rule_found)

        # 1. Check Copy Button
        copy_btn = page.query_selector("#btn-copy-console")
        if copy_btn:
            print("PASS: Copy Console button found.")
        else:
            print("FAIL: Copy Console button NOT found.")

        # 2. Check Terminal Styles
        # Force open console pane
        page.evaluate("document.getElementById('console-pane').classList.remove('hidden')")

        terminal = page.query_selector(".terminal-container")
        if terminal:
            wb = page.evaluate("window.getComputedStyle(document.querySelector('.terminal-container')).wordBreak")
            ow = page.evaluate("window.getComputedStyle(document.querySelector('.terminal-container')).overflowWrap")
            ww = page.evaluate("window.getComputedStyle(document.querySelector('.terminal-container')).wordWrap")
            bg = page.evaluate("window.getComputedStyle(document.querySelector('.terminal-container')).backgroundColor")

            print(f"Terminal word-break: {wb}")
            print(f"Terminal overflow-wrap: {ow}")
            print(f"Terminal word-wrap: {ww}")
            print(f"Terminal background-color: {bg}")

            # Check if overflow-wrap OR word-wrap is break-word (some browsers alias them)
            if wb == "normal" and (ow == "break-word" or ww == "break-word"):
                print("PASS: Terminal styles are correct.")
            else:
                print("FAIL: Terminal styles incorrect.")
        else:
            print("FAIL: Terminal container not found.")

        browser.close()

if __name__ == "__main__":
    verify_v3()
