
import time
import subprocess
import threading
import sys
import os
from playwright.sync_api import sync_playwright

SERVER_PORT = 3000
SERVER_URL = f"http://localhost:{SERVER_PORT}"

def run_server():
    print(f"Starting server on port {SERVER_PORT}...")
    # Kill any existing process on 3000
    os.system(f"kill $(lsof -t -i :{SERVER_PORT}) 2>/dev/null || true")

    cmd = ["npm", "run", "dev", "--", "--port", str(SERVER_PORT)]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    # Read output to detect readiness
    for line in process.stdout:
        print(f"[SERVER] {line.strip()}")
        if "Local:" in line and str(SERVER_PORT) in line:
            print("Server is ready!")
            break

    # Keep reading in background
    def log_reader():
        for line in process.stdout:
            pass # Drain
    threading.Thread(target=log_reader, daemon=True).start()

    return process

def verify_redirect():
    process = run_server()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            console_logs = []
            page.on("console", lambda msg: console_logs.append(msg.text))

            print(f"Navigating to {SERVER_URL}...")
            page.goto(SERVER_URL)

            # Wait for app load
            try:
                page.wait_for_selector("#app-content", timeout=10000)
            except:
                print("Timeout waiting for app content.")
                # It might be behind the login overlay

            # Check for Login Modal
            # It's usually #login-overlay now
            login_modal = page.locator("#login-overlay")
            if login_modal.is_visible():
                print("Login modal is visible.")

                # Check for Google Sign In Button
                login_btn = page.get_by_text("Continue with Google")

                if login_btn.count() > 0:
                    print("Found Google Sign In button. Clicking...")

                    # Click and expect navigation to /auth.html
                    with page.expect_navigation(url="**/auth.html"):
                        login_btn.click()

                    print("Successfully navigated to auth.html!")

                    # Now on auth.html
                    # Check for "Continue with Google" there too
                    auth_google_btn = page.get_by_text("Continue with Google")
                    if auth_google_btn.count() > 0:
                         print("Found Google button on Auth Bridge page.")
                         # We can't actually log in via Google in headless automated test without credentials
                         # But reaching here proves the bridge link works.
                    else:
                         print("FAILURE: Did not find Google button on auth.html")
                         exit(1)

                else:
                    print("Google Sign In button not found.")
            else:
                print("Login modal not initially visible. Maybe already logged in?")

    finally:
        print("Stopping server...")
        process.terminate()
        process.wait()

if __name__ == "__main__":
    verify_redirect()
