import sys
from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOT_DIR = "verification_screenshots_ui"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}")

def run():
    print("Starting UI Loading Verification Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()

        print("\n--- 1. Loading App ---")

        # Track 404s
        page.on("response", lambda response: print(f"FAIL: 404 for {response.url}") if response.status == 404 else None)

        # Verify tailwindcss.js specifically
        def handle_response(response):
            if "tailwindcss.js" in response.url:
                if response.status == 200:
                    print(f"PASS: tailwindcss.js loaded successfully ({response.status})")
                else:
                    print(f"FAIL: tailwindcss.js failed to load ({response.status})")

        page.on("response", handle_response)

        page.goto("http://localhost:3000")

        try:
            page.wait_for_selector("body", timeout=10000)

            # Wait for Tailwind initialization (computed style check)
            # We check if #btn-run has a computed style that implies Tailwind loaded
            # e.g., it has classes 'bg-accent', etc. bg-accent maps to var(--color-accent) or a specific color.
            # Let's check if body has background color set correctly via Tailwind class 'bg-darker'

            # Wait a bit for script to run
            page.wait_for_timeout(2000)

            # Check computed style of an element that relies on Tailwind
            # #btn-run class: "bg-accent ... w-8 h-8"
            # w-8 is 2rem (32px).

            width = page.evaluate("window.getComputedStyle(document.getElementById('btn-run')).width")
            print(f"Button Width: {width}")

            if width == "32px":
                print("PASS: Tailwind utility class 'w-8' applied correctly.")
            else:
                print(f"FAIL: Tailwind utility class 'w-8' NOT applied. Width: {width}")

            # Check if grid layout is working (another indicator)
            display = page.evaluate("window.getComputedStyle(document.getElementById('snippets-list')).display")
            print(f"Snippets List Display: {display}")

            if display == "grid":
                 print("PASS: Tailwind 'grid' class applied.")
            else:
                 print(f"FAIL: Tailwind 'grid' class NOT applied. Display: {display}")

        except Exception as e:
            print(f"FAIL: Error during test: {e}")

        screenshot(page, "ui_fixed")
        browser.close()

if __name__ == "__main__":
    run()
