from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:3000")
    page.wait_for_load_state("networkidle")

    # Take a screenshot of the page
    page.screenshot(path="jules-scratch/verification/initial_view.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
