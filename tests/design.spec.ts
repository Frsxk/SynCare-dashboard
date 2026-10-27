import { expect, test } from "@playwright/test";
import { loginNurse } from "./local-accounts";

test.use({ trace: "off", screenshot: "off" });

test("workspace task cards and active navigation reflow with actual module content at 200% text", async ({ page }) => {
  await loginNurse(page);
  for (const href of ["/patients", "/monitoring", "/homecare", "/escalations"]) {
    await page.goto("/workspace");
    const card = page.locator(`.task-card[href="${href}"]`);
    await card.focus();
    await card.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation").locator('[aria-current="page"]')).toHaveAttribute("href", href);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const textSize of ["100%", "200%"]) {
        await page.evaluate(size => { document.documentElement.style.fontSize = size; }, textSize);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
  }
});
