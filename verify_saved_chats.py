from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # 1. Pre-fill localStorage to bypass Onboarding if Auth passes,
    # but Auth will fail/hang without net.
    # So we will manually force UI state after load.

    page.goto("http://localhost:5173")

    # Wait for app to initialize
    time.sleep(2)

    # Force bypass login overlay
    page.evaluate("""
        const overlay = document.getElementById('login-overlay');
        if(overlay) overlay.classList.add('hidden');
        const app = document.getElementById('app-content');
        if(app) {
            app.classList.remove('filter', 'blur-sm', 'pointer-events-none');
            app.classList.remove('blur-active');
        }
    """)

    # 2. Open Sidebar
    page.click("#btn-toggle-sidebar")
    time.sleep(0.5)

    # 3. Verify Saved Chats Button
    btn = page.locator("#btn-saved-chats")
    expect(btn).to_be_visible()
    print("Saved Chats button found.")

    # 4. Click Saved Chats
    btn.click()
    time.sleep(0.5)

    # 5. Verify View
    view = page.locator("#view-saved-chats")
    expect(view).to_be_visible()
    print("Saved Chats view visible.")

    # Screenshot Empty State
    page.screenshot(path="verification_saved_chats_empty.png")

    # 6. Inject Dummy Chat
    page.evaluate("""
        const chats = [{
            id: 123,
            title: "Test Chat 1",
            content: "```python\\nprint('Hello World')\\n```\\nThis is a test chat.",
            role: "assistant",
            timestamp: Date.now()
        }];
        localStorage.setItem('pyide_saved_chats', JSON.stringify(chats));
        // Re-render
        import('./js/saved-chats.js').then(m => m.renderSavedChatsList());
    """)
    time.sleep(0.5)

    # Screenshot List State
    page.screenshot(path="verification_saved_chats_list.png")

    # 7. Open Chat
    page.get_by_text("Test Chat 1").click()
    time.sleep(0.5)

    # Verify Content
    expect(page.locator(".markdown-body")).to_contain_text("This is a test chat")
    expect(page.locator("code")).to_contain_text("print('Hello World')")

    # Screenshot Detail State
    page.screenshot(path="verification_saved_chats_detail.png")
    print("Detail view verified.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
