import { expect, expectAccessible, signIn, test } from "./fixtures";

test("dashboard shows KPIs from the warehouse and filters by company", async ({ page }) => {
  await signIn(page, "anna.schmidt");
  await expect(page.getByRole("heading", { name: "Hello, Anna" })).toBeVisible();
  const kpis = page.getByRole("region", { name: "KPIs" });
  await expect(kpis.getByText("Invoiced revenue")).toBeVisible();
  await expect(kpis.getByText("SLA compliance")).toBeVisible();
  await expect(page.getByText(/Data as of/)).toBeVisible();
  const before = await kpis.getByText("Open pipeline").locator("xpath=following-sibling::p[1]").textContent();
  await page.getByLabel("Company").selectOption("RWS");
  await expect(kpis.getByText("Open pipeline").locator("xpath=following-sibling::p[1]")).not.toHaveText(before!);
});

test("charts have a table alternative", async ({ page }) => {
  await signIn(page, "anna.schmidt");
  await page.getByText("Show as table").first().click();
  await expect(page.getByRole("table", { name: "Revenue and won deals" })).toBeVisible();
});

test("dashboard is accessible", async ({ page }) => {
  await signIn(page, "anna.schmidt");
  await expect(page.getByText("Invoiced revenue")).toBeVisible();
  await expectAccessible(page);
});

test("navigation only shows permitted areas", async ({ page }) => {
  await signIn(page, "tim.hoffmann");
  await expect(page.getByRole("link", { name: "Leave" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices" })).toHaveCount(0);
  await page.goto("/accounting/invoices");
  await expect(page.getByText("You don't have access to this area.")).toBeVisible();
});
