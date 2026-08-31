import { expect, test } from "@playwright/test";

test("Startseite antwortet mit 200 und rendert", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
});
