import { test, expect } from '@playwright/test';

test.describe('UI visual regression', () => {
  test('landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('landing-page')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('landing-desktop.png', {
      maxDiffPixelRatio: 0.025,
    });
  });

  test('lab chat shell', async ({ page }) => {
    await page.goto('/lab');
    await expect(page.getByTestId('chat-shell')).toBeVisible();
    await expect(page.getByTestId('chat-composer')).toBeVisible();
    await expect(page.getByRole('group', { name: '常见症状快捷输入' })).toBeVisible();
    await expect(page).toHaveScreenshot('lab-chat-desktop.png', {
      maxDiffPixelRatio: 0.025,
    });
  });
});
