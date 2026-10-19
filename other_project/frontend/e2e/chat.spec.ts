import { test, expect } from '@playwright/test';

const baseUrl = 'http://localhost:5173';

test('can accept terms and continue from information dialog', async ({ page }) => {
    await page.goto(baseUrl);

    await expect(page.getByText('IRiS is designed to improve the PQ and FOI process')).toBeVisible();

    await page.getByRole('checkbox').click();

    const continueButton = await page.getByRole('button', { name: 'Accept and continue' });
    await expect(continueButton).toBeVisible();
    await continueButton.click();

    await expect(page.getByText('IRiS is designed to improve the PQ and FOI process')).not.toBeVisible();
});
