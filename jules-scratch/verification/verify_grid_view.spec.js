const { test, expect } = require('@playwright/test');

test('should switch to grid view when the grid view button is clicked', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for the app to load
  await page.waitForSelector('text=AI Image Tagger', { timeout: 10000 });

  // Click the grid view button
  await page.click('button[aria-label="grid-view"]', { timeout: 5000 });

  // Wait for the grid view to be visible
  await page.waitForSelector('.grid.grid-cols-3', { timeout: 5000 });

  // Capture a screenshot of the grid view
  await page.screenshot({ path: 'jules-scratch/verification/grid_view.png' });

  // Assert that the grid view is visible
  const gridView = await page.locator('.grid.grid-cols-3');
  await expect(gridView).toBeVisible();
});
